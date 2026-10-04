import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { FileQueueStore } from "../src/lib/store.js";
import { createQueueServer } from "../src/queue-tools.js";

const servers: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function connected() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "queue-test-"));
  const store = new FileQueueStore(dir, "local");
  const server = createQueueServer(store);
  const client = new Client({ name: "queue-test", version: "0.0.1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  servers.push(client, server);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  const text = result.content?.find((item) => item.type === "text");
  const payload = text && "text" in text ? JSON.parse(text.text) : null;
  return { result, payload };
}

describe("queue tools", () => {
  it("lists the response-time tools", async () => {
    const client = await connected();
    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name).sort();
    expect(names).toEqual([
      "create_response_catalog",
      "evaluate_plan_coverage",
      "evaluate_support_promise",
      "get_queue_context",
      "list_plan_channels",
      "list_reply_windows",
      "list_response_catalogs",
      "list_staffing_promises",
      "save_customer_plan",
      "save_plan_channel",
      "save_reply_window",
      "save_staffing_promise",
      "search_customer_plans"
    ]);
  });

  it("stores a plan and refuses a faster reply, a dedicated agent, and a missing channel", async () => {
    const client = await connected();
    const catalog = await call(client, "create_response_catalog", { name: "Acme support" });
    const catalogId = catalog.payload.id as string;
    const savedPlan = await call(client, "save_customer_plan", {
      catalogId,
      name: "Starter",
      summary: "Self-serve teams on the starter plan"
    });
    const planId = savedPlan.payload.id as string;
    const statement = "We reply within one business day.";
    const window = await call(client, "save_reply_window", {
      catalogId,
      planId,
      name: "Business day",
      withinMinutes: 480,
      statement
    });
    expect(window.payload.revision).toBe(1);
    const retry = await call(client, "save_reply_window", {
      catalogId,
      planId,
      name: "Business day",
      withinMinutes: 480,
      statement
    });
    expect(retry.payload.revision).toBe(1);

    await call(client, "save_plan_channel", {
      catalogId,
      planId,
      name: "Email",
      channel: "email",
      statement: "Email is included on this plan."
    });
    await call(client, "save_staffing_promise", {
      catalogId,
      planId,
      name: "Shared queue",
      staffingKind: "SHARED_QUEUE",
      statement: "Replies come from the shared queue."
    });

    const lookup = await call(client, "search_customer_plans", { catalogId, query: "starter" });
    expect(lookup.payload.plans).toHaveLength(1);
    expect(lookup.payload.gap).toBeNull();

    const missing = await call(client, "search_customer_plans", { catalogId, query: "satellite warranty" });
    expect(missing.payload.plans).toHaveLength(0);
    expect(missing.payload.gap).toMatch(/Do not invent/);

    const faster = await call(client, "evaluate_support_promise", {
      catalogId,
      planId,
      kind: "REPLY_WINDOW",
      proposal: "We will reply within one hour."
    });
    expect(faster.payload.decision).toBe("REFUSED");
    expect(faster.payload.fasterThanApproved).toBe(true);

    const phone = await call(client, "evaluate_support_promise", {
      catalogId,
      planId,
      kind: "CHANNEL",
      proposal: "We can call you on the phone."
    });
    expect(phone.payload.decision).toBe("REFUSED");
    expect(phone.payload.channelMissing).toBe(true);

    const dedicated = await call(client, "evaluate_support_promise", {
      catalogId,
      planId,
      kind: "STAFFING",
      proposal: "You will have a dedicated agent."
    });
    expect(dedicated.payload.decision).toBe("REFUSED");
    expect(dedicated.payload.dedicatedAgentMissing).toBe(true);

    const approved = await call(client, "evaluate_support_promise", {
      catalogId,
      planId,
      kind: "REPLY_WINDOW",
      proposal: statement
    });
    expect(approved.payload.decision).toBe("APPROVED");
    expect(approved.payload.sayOnly).toBe(statement);

    const coverage = await call(client, "evaluate_plan_coverage", {
      catalogId,
      planId,
      action: "OFFER_CHANNEL",
      channel: "phone"
    });
    expect(coverage.payload.decision).toBe("REFUSED");

    const tooFast = await call(client, "save_reply_window", {
      catalogId,
      planId,
      name: "Hour",
      withinMinutes: 480,
      statement: "We reply within one hour."
    });
    expect(tooFast.payload.error).toMatch(/faster than the approved wait/);

    const conflict = await call(client, "save_customer_plan", {
      catalogId,
      name: "Starter",
      summary: "A different summary"
    });
    expect(conflict.payload.error).toMatch(/Revision conflict/);

    const context = await call(client, "get_queue_context", { catalogId, question: "What reply time does Starter include?" });
    expect(context.payload.customer_plans).toHaveLength(1);
    expect(context.payload.customer_plans[0].reply_windows).toHaveLength(1);
    expect(context.payload.guidance).toMatch(/faster reply/);
  });
});
