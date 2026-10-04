import type { Express, Request, Response } from "express";
import { z } from "zod";
import { publicError } from "./lib/errors.js";
import { saveCustomerPlan, savePlanChannel, saveReplyWindow, saveStaffingPromise } from "./lib/records.js";
import type { QueueStore } from "./lib/store.js";

export type Account = { user: { id: string }; token: string };
export type SubscriptionState = "ok" | "inactive" | "error";

export type WorkspaceDeps = {
  appBaseUrl: string;
  authenticate: (req: Request) => Promise<Account>;
  subscriptionState: (userId: string, token: string) => Promise<SubscriptionState>;
  createStore: (userId: string, token: string) => QueueStore;
  allow: (key: string) => boolean;
};

const catalogId = z.string().uuid();
const planId = z.string().uuid();
const status = z.enum(["APPROVED", "RETIRED"]).default("APPROVED");
const channel = z.enum(["email", "chat", "phone", "sms", "video"]);
const staffingKind = z.enum(["SHARED_QUEUE", "DEDICATED_AGENT"]);

const planBody = z.object({
  catalogId,
  name: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(500),
  status,
  expectedRevision: z.number().int().positive().optional()
});
const windowBody = z.object({
  catalogId,
  planId,
  name: z.string().trim().min(1).max(200),
  withinMinutes: z.number().int().min(1).max(525600),
  statement: z.string().trim().min(1).max(2000),
  status,
  expectedRevision: z.number().int().positive().optional()
});
const channelBody = z.object({
  catalogId,
  planId,
  name: z.string().trim().min(1).max(200),
  channel,
  statement: z.string().trim().min(1).max(2000),
  status,
  expectedRevision: z.number().int().positive().optional()
});
const staffingBody = z.object({
  catalogId,
  planId,
  name: z.string().trim().min(1).max(200),
  staffingKind,
  statement: z.string().trim().min(1).max(2000),
  status,
  expectedRevision: z.number().int().positive().optional()
});

function sendFailure(res: Response, error: unknown) {
  const safe = publicError(error);
  res.status(safe.status).json({ error: safe.error });
}

export function installWorkspaceApi(app: Express, deps: WorkspaceDeps) {
  async function open(req: Request, res: Response): Promise<{ store: QueueStore } | null> {
    if (!deps.allow(`workspace:${req.ip}`)) {
      res.status(429).json({ error: "Too many requests. Retry in one minute." });
      return null;
    }
    let account: Account;
    try {
      account = await deps.authenticate(req);
    } catch {
      res.set("WWW-Authenticate", `Bearer resource_metadata="${deps.appBaseUrl}/.well-known/oauth-protected-resource/mcp"`);
      res.status(401).json({ error: "Sign in to Queue to use response tools." });
      return null;
    }
    const state = await deps.subscriptionState(account.user.id, account.token);
    if (state === "error") {
      res.status(503).json({ error: "Could not verify your subscription. Please retry." });
      return null;
    }
    if (state === "inactive") {
      res.status(403).json({ error: "A Queue Pro subscription or active trial is required.", access_information: `${deps.appBaseUrl}/access` });
      return null;
    }
    return { store: deps.createStore(account.user.id, account.token) };
  }

  app.get("/api/workspace/catalogs", async (req, res) => {
    const ctx = await open(req, res);
    if (!ctx) return;
    const offset = z.coerce.number().int().min(0).max(100000).catch(0).parse(req.query.offset);
    res.json({ data: await ctx.store.listCatalogs(offset) });
  });

  app.post("/api/workspace/catalogs", async (req, res) => {
    const ctx = await open(req, res);
    if (!ctx) return;
    const body = z.object({ name: z.string().trim().min(1).max(200), description: z.string().trim().max(4000).optional() }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Enter a catalog name." });
    try {
      res.json({ data: await ctx.store.createCatalog(body.data.name, body.data.description ?? null) });
    } catch (error) {
      sendFailure(res, error);
    }
  });

  app.get("/api/workspace/export", async (req, res) => {
    const ctx = await open(req, res);
    if (!ctx) return;
    const parsed = z.object({ catalogId }).safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Catalog not found" });
    const data = await ctx.store.exportCatalog(parsed.data.catalogId);
    if (!data) return res.status(404).json({ error: "Catalog not found" });
    res.json({ data });
  });

  app.delete("/api/workspace/catalogs/:catalogId", async (req, res) => {
    const ctx = await open(req, res);
    if (!ctx) return;
    const parsed = z.object({ catalogId }).safeParse(req.params);
    if (!parsed.success) return res.status(404).json({ error: "Catalog not found" });
    const removed = await ctx.store.deleteCatalog(parsed.data.catalogId);
    if (!removed) return res.status(404).json({ error: "Catalog not found" });
    res.json({ data: { deleted: true } });
  });

  app.get("/api/workspace/plans", async (req, res) => {
    const ctx = await open(req, res);
    if (!ctx) return;
    const parsed = z.object({
      catalogId,
      query: z.string().max(200).optional(),
      offset: z.coerce.number().int().min(0).max(100000).optional(),
      includeRetired: z.enum(["true", "false"]).optional()
    }).safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Catalog not found" });
    try {
      const rows = await ctx.store.listPlans(parsed.data.catalogId, parsed.data.offset ?? 0, parsed.data.query ?? "", parsed.data.includeRetired === "true");
      res.json({ data: rows });
    } catch (error) {
      sendFailure(res, error);
    }
  });

  app.post("/api/workspace/plans", async (req, res) => {
    const ctx = await open(req, res);
    if (!ctx) return;
    const body = planBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Check the customer plan and try again." });
    try {
      res.json({ data: await saveCustomerPlan(ctx.store, body.data) });
    } catch (error) {
      sendFailure(res, error);
    }
  });

  app.get("/api/workspace/reply-windows", async (req, res) => {
    const ctx = await open(req, res);
    if (!ctx) return;
    const parsed = z.object({ catalogId, planId, includeRetired: z.enum(["true", "false"]).optional() }).safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Plan not found" });
    const plan = await ctx.store.getPlan(parsed.data.planId);
    if (!plan || plan.catalogId !== parsed.data.catalogId) return res.status(404).json({ error: "Plan not found" });
    res.json({ data: await ctx.store.listWindows(parsed.data.planId, parsed.data.includeRetired === "true") });
  });

  app.post("/api/workspace/reply-windows", async (req, res) => {
    const ctx = await open(req, res);
    if (!ctx) return;
    const body = windowBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Check the reply window and try again." });
    try {
      res.json({ data: await saveReplyWindow(ctx.store, body.data) });
    } catch (error) {
      sendFailure(res, error);
    }
  });

  app.get("/api/workspace/channels", async (req, res) => {
    const ctx = await open(req, res);
    if (!ctx) return;
    const parsed = z.object({ catalogId, planId, includeRetired: z.enum(["true", "false"]).optional() }).safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Plan not found" });
    const plan = await ctx.store.getPlan(parsed.data.planId);
    if (!plan || plan.catalogId !== parsed.data.catalogId) return res.status(404).json({ error: "Plan not found" });
    res.json({ data: await ctx.store.listChannels(parsed.data.planId, parsed.data.includeRetired === "true") });
  });

  app.post("/api/workspace/channels", async (req, res) => {
    const ctx = await open(req, res);
    if (!ctx) return;
    const body = channelBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Check the support channel and try again." });
    try {
      res.json({ data: await savePlanChannel(ctx.store, body.data) });
    } catch (error) {
      sendFailure(res, error);
    }
  });

  app.get("/api/workspace/staffing", async (req, res) => {
    const ctx = await open(req, res);
    if (!ctx) return;
    const parsed = z.object({ catalogId, planId, includeRetired: z.enum(["true", "false"]).optional() }).safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Plan not found" });
    const plan = await ctx.store.getPlan(parsed.data.planId);
    if (!plan || plan.catalogId !== parsed.data.catalogId) return res.status(404).json({ error: "Plan not found" });
    res.json({ data: await ctx.store.listStaffing(parsed.data.planId, parsed.data.includeRetired === "true") });
  });

  app.post("/api/workspace/staffing", async (req, res) => {
    const ctx = await open(req, res);
    if (!ctx) return;
    const body = staffingBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Check the staffing promise and try again." });
    try {
      res.json({ data: await saveStaffingPromise(ctx.store, body.data) });
    } catch (error) {
      sendFailure(res, error);
    }
  });
}
