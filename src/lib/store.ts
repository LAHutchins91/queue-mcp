import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type RecordStatus = "APPROVED" | "RETIRED";
export type ChannelKey = "email" | "chat" | "phone" | "sms" | "video";
export type StaffingKind = "SHARED_QUEUE" | "DEDICATED_AGENT";

export type ResponseCatalogRecord = {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string;
};

export type CustomerPlanRecord = {
  id: string;
  catalogId: string;
  name: string;
  summary: string;
  status: RecordStatus;
  revision: number;
  updatedAt: string;
};

export type ReplyWindowRecord = {
  id: string;
  catalogId: string;
  planId: string;
  name: string;
  withinMinutes: number;
  statement: string;
  status: RecordStatus;
  revision: number;
  updatedAt: string;
};

export type PlanChannelRecord = {
  id: string;
  catalogId: string;
  planId: string;
  name: string;
  channel: ChannelKey;
  statement: string;
  status: RecordStatus;
  revision: number;
  updatedAt: string;
};

export type StaffingPromiseRecord = {
  id: string;
  catalogId: string;
  planId: string;
  name: string;
  staffingKind: StaffingKind;
  statement: string;
  status: RecordStatus;
  revision: number;
  updatedAt: string;
};

export type QueueExport = {
  catalog: ResponseCatalogRecord;
  plans: CustomerPlanRecord[];
  replyWindows: ReplyWindowRecord[];
  channels: PlanChannelRecord[];
  staffingPromises: StaffingPromiseRecord[];
};

export type QueueDb = <T>(pathname: string, options?: RequestInit) => Promise<T>;

export interface QueueStore {
  listCatalogs(offset: number): Promise<ResponseCatalogRecord[]>;
  createCatalog(name: string, description: string | null): Promise<ResponseCatalogRecord>;
  getCatalog(catalogId: string): Promise<ResponseCatalogRecord | null>;
  touchCatalog(catalogId: string): Promise<void>;
  deleteCatalog(catalogId: string): Promise<boolean>;
  exportCatalog(catalogId: string): Promise<QueueExport | null>;
  findPlan(catalogId: string, name: string): Promise<CustomerPlanRecord | null>;
  getPlan(planId: string): Promise<CustomerPlanRecord | null>;
  insertPlan(row: CustomerPlanRecord): Promise<CustomerPlanRecord>;
  updatePlan(row: CustomerPlanRecord, expectedRevision: number): Promise<CustomerPlanRecord | null>;
  listPlans(catalogId: string, offset: number, query: string, includeRetired: boolean): Promise<CustomerPlanRecord[]>;
  listPlansForRank(catalogId: string): Promise<CustomerPlanRecord[]>;
  findWindow(planId: string, name: string): Promise<ReplyWindowRecord | null>;
  insertWindow(row: ReplyWindowRecord): Promise<ReplyWindowRecord>;
  updateWindow(row: ReplyWindowRecord, expectedRevision: number): Promise<ReplyWindowRecord | null>;
  listWindows(planId: string, includeRetired: boolean): Promise<ReplyWindowRecord[]>;
  listWindowsForCatalog(catalogId: string): Promise<ReplyWindowRecord[]>;
  findChannel(planId: string, channel: ChannelKey): Promise<PlanChannelRecord | null>;
  insertChannel(row: PlanChannelRecord): Promise<PlanChannelRecord>;
  updateChannel(row: PlanChannelRecord, expectedRevision: number): Promise<PlanChannelRecord | null>;
  listChannels(planId: string, includeRetired: boolean): Promise<PlanChannelRecord[]>;
  listChannelsForCatalog(catalogId: string): Promise<PlanChannelRecord[]>;
  findStaffing(planId: string, kind: StaffingKind): Promise<StaffingPromiseRecord | null>;
  insertStaffing(row: StaffingPromiseRecord): Promise<StaffingPromiseRecord>;
  updateStaffing(row: StaffingPromiseRecord, expectedRevision: number): Promise<StaffingPromiseRecord | null>;
  listStaffing(planId: string, includeRetired: boolean): Promise<StaffingPromiseRecord[]>;
  listStaffingForCatalog(catalogId: string): Promise<StaffingPromiseRecord[]>;
}

type FileShape = {
  catalogs: ResponseCatalogRecord[];
  plans: CustomerPlanRecord[];
  windows: ReplyWindowRecord[];
  channels: PlanChannelRecord[];
  staffing: StaffingPromiseRecord[];
};

const emptyFile = (): FileShape => ({ catalogs: [], plans: [], windows: [], channels: [], staffing: [] });

function sameText(left: string, right: string): boolean {
  return left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();
}

function ownerFile(ownerId: string): string {
  const safe = /^[a-zA-Z0-9_-]{1,80}$/.test(ownerId) ? ownerId : "local";
  return `${safe}.json`;
}

export class FileQueueStore implements QueueStore {
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly directory: string, private readonly ownerId: string) {}

  private async locked<T>(fn: (data: FileShape) => Promise<T> | T): Promise<T> {
    const run = this.chain.then(async () => {
      await mkdir(this.directory, { recursive: true });
      const file = path.join(this.directory, ownerFile(this.ownerId));
      let data = emptyFile();
      try {
        const parsed = JSON.parse(await readFile(file, "utf8")) as Partial<FileShape>;
        data = {
          catalogs: parsed.catalogs ?? [],
          plans: parsed.plans ?? [],
          windows: parsed.windows ?? [],
          channels: parsed.channels ?? [],
          staffing: parsed.staffing ?? []
        };
      } catch (error) {
        const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
        if (code !== "ENOENT") throw error;
      }
      const result = await fn(data);
      const next = path.join(this.directory, `${ownerFile(this.ownerId)}.tmp`);
      await writeFile(next, JSON.stringify(data));
      await rename(next, file);
      return result;
    });
    this.chain = run.then(() => undefined, () => undefined);
    return run;
  }

  listCatalogs(offset: number) {
    return this.locked((data) => data.catalogs.slice().sort(byUpdated).slice(offset, offset + 50).map(clone));
  }
  createCatalog(name: string, description: string | null) {
    return this.locked((data) => {
      const row: ResponseCatalogRecord = { id: crypto.randomUUID(), name, description, updatedAt: new Date().toISOString() };
      data.catalogs.push(row);
      return clone(row);
    });
  }
  getCatalog(catalogId: string) {
    return this.locked((data) => clone(data.catalogs.find((row) => row.id === catalogId) ?? null));
  }
  touchCatalog(catalogId: string) {
    return this.locked((data) => {
      const catalog = data.catalogs.find((row) => row.id === catalogId);
      if (catalog) catalog.updatedAt = new Date().toISOString();
    });
  }
  deleteCatalog(catalogId: string) {
    return this.locked((data) => {
      const before = data.catalogs.length;
      data.catalogs = data.catalogs.filter((row) => row.id !== catalogId);
      data.plans = data.plans.filter((row) => row.catalogId !== catalogId);
      data.windows = data.windows.filter((row) => row.catalogId !== catalogId);
      data.channels = data.channels.filter((row) => row.catalogId !== catalogId);
      data.staffing = data.staffing.filter((row) => row.catalogId !== catalogId);
      return data.catalogs.length !== before;
    });
  }
  exportCatalog(catalogId: string) {
    return this.locked((data) => {
      const catalog = data.catalogs.find((row) => row.id === catalogId);
      if (!catalog) return null;
      return {
        catalog: clone(catalog),
        plans: data.plans.filter((row) => row.catalogId === catalogId).map(clone),
        replyWindows: data.windows.filter((row) => row.catalogId === catalogId).map(clone),
        channels: data.channels.filter((row) => row.catalogId === catalogId).map(clone),
        staffingPromises: data.staffing.filter((row) => row.catalogId === catalogId).map(clone)
      };
    });
  }
  findPlan(catalogId: string, name: string) {
    return this.locked((data) => clone(data.plans.find((row) => row.catalogId === catalogId && sameText(row.name, name)) ?? null));
  }
  getPlan(planId: string) {
    return this.locked((data) => clone(data.plans.find((row) => row.id === planId) ?? null));
  }
  insertPlan(row: CustomerPlanRecord) {
    return this.locked((data) => { data.plans.push(clone(row)); return clone(row); });
  }
  updatePlan(row: CustomerPlanRecord, expectedRevision: number) {
    return this.locked((data) => replace(data.plans, row, expectedRevision));
  }
  listPlans(catalogId: string, offset: number, query: string, includeRetired: boolean) {
    return this.locked((data) => sliceMatches(data.plans, catalogId, includeRetired, query, ["name", "summary"], offset));
  }
  listPlansForRank(catalogId: string) {
    return this.locked((data) => data.plans.filter((row) => row.catalogId === catalogId && row.status === "APPROVED").slice(0, 1000).map(clone));
  }
  findWindow(planId: string, name: string) {
    return this.locked((data) => clone(data.windows.find((row) => row.planId === planId && sameText(row.name, name)) ?? null));
  }
  insertWindow(row: ReplyWindowRecord) {
    return this.locked((data) => { data.windows.push(clone(row)); return clone(row); });
  }
  updateWindow(row: ReplyWindowRecord, expectedRevision: number) {
    return this.locked((data) => replace(data.windows, row, expectedRevision));
  }
  listWindows(planId: string, includeRetired: boolean) {
    return this.locked((data) => data.windows.filter((row) => row.planId === planId && (includeRetired || row.status === "APPROVED")).map(clone));
  }
  listWindowsForCatalog(catalogId: string) {
    return this.locked((data) => data.windows.filter((row) => row.catalogId === catalogId && row.status === "APPROVED").slice(0, 1000).map(clone));
  }
  findChannel(planId: string, channel: ChannelKey) {
    return this.locked((data) => clone(data.channels.find((row) => row.planId === planId && row.channel === channel) ?? null));
  }
  insertChannel(row: PlanChannelRecord) {
    return this.locked((data) => { data.channels.push(clone(row)); return clone(row); });
  }
  updateChannel(row: PlanChannelRecord, expectedRevision: number) {
    return this.locked((data) => replace(data.channels, row, expectedRevision));
  }
  listChannels(planId: string, includeRetired: boolean) {
    return this.locked((data) => data.channels.filter((row) => row.planId === planId && (includeRetired || row.status === "APPROVED")).map(clone));
  }
  listChannelsForCatalog(catalogId: string) {
    return this.locked((data) => data.channels.filter((row) => row.catalogId === catalogId && row.status === "APPROVED").slice(0, 1000).map(clone));
  }
  findStaffing(planId: string, kind: StaffingKind) {
    return this.locked((data) => clone(data.staffing.find((row) => row.planId === planId && row.staffingKind === kind) ?? null));
  }
  insertStaffing(row: StaffingPromiseRecord) {
    return this.locked((data) => { data.staffing.push(clone(row)); return clone(row); });
  }
  updateStaffing(row: StaffingPromiseRecord, expectedRevision: number) {
    return this.locked((data) => replace(data.staffing, row, expectedRevision));
  }
  listStaffing(planId: string, includeRetired: boolean) {
    return this.locked((data) => data.staffing.filter((row) => row.planId === planId && (includeRetired || row.status === "APPROVED")).map(clone));
  }
  listStaffingForCatalog(catalogId: string) {
    return this.locked((data) => data.staffing.filter((row) => row.catalogId === catalogId && row.status === "APPROVED").slice(0, 1000).map(clone));
  }
}

function byUpdated(a: { updatedAt: string }, b: { updatedAt: string }) {
  return b.updatedAt.localeCompare(a.updatedAt);
}

function clone<T>(value: T): T {
  return value == null ? value : structuredClone(value);
}

function replace<T extends { id: string; revision: number }>(rows: T[], row: T, expectedRevision: number): T | null {
  const index = rows.findIndex((item) => item.id === row.id && item.revision === expectedRevision);
  if (index < 0) return null;
  rows[index] = clone(row);
  return clone(row);
}

function sliceMatches<T extends { catalogId: string; status: RecordStatus }>(
  rows: T[],
  catalogId: string,
  includeRetired: boolean,
  query: string,
  fields: Array<keyof T>,
  offset: number
): T[] {
  const needle = query.trim().toLocaleLowerCase();
  return rows
    .filter((row) => row.catalogId === catalogId && (includeRetired || row.status === "APPROVED"))
    .filter((row) => !needle || fields.some((field) => String(row[field]).toLocaleLowerCase().includes(needle)))
    .slice(offset, offset + 50)
    .map(clone);
}

type Row = Record<string, unknown>;

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
function asNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}
function asStatus(value: unknown): RecordStatus {
  return value === "RETIRED" ? "RETIRED" : "APPROVED";
}
function asChannel(value: unknown): ChannelKey | null {
  if (value === "email" || value === "chat" || value === "phone" || value === "sms" || value === "video") return value;
  return null;
}
function asStaffing(value: unknown): StaffingKind | null {
  if (value === "SHARED_QUEUE" || value === "DEDICATED_AGENT") return value;
  return null;
}

function mapCatalog(row: Row): ResponseCatalogRecord {
  return { id: asString(row.id), name: asString(row.name), description: asStringOrNull(row.description), updatedAt: asString(row.updated_at) };
}
function mapPlan(row: Row): CustomerPlanRecord {
  return {
    id: asString(row.id), catalogId: asString(row.catalog_id), name: asString(row.name), summary: asString(row.summary),
    status: asStatus(row.status), revision: asNumber(row.revision), updatedAt: asString(row.updated_at)
  };
}
function mapWindow(row: Row): ReplyWindowRecord {
  return {
    id: asString(row.id), catalogId: asString(row.catalog_id), planId: asString(row.plan_id), name: asString(row.name),
    withinMinutes: asNumber(row.within_minutes), statement: asString(row.statement), status: asStatus(row.status),
    revision: asNumber(row.revision), updatedAt: asString(row.updated_at)
  };
}
function mapChannel(row: Row): PlanChannelRecord | null {
  const channel = asChannel(row.channel);
  if (!channel) return null;
  return {
    id: asString(row.id), catalogId: asString(row.catalog_id), planId: asString(row.plan_id), name: asString(row.name),
    channel, statement: asString(row.statement), status: asStatus(row.status), revision: asNumber(row.revision), updatedAt: asString(row.updated_at)
  };
}
function mapStaffing(row: Row): StaffingPromiseRecord | null {
  const staffingKind = asStaffing(row.staffing_kind);
  if (!staffingKind) return null;
  return {
    id: asString(row.id), catalogId: asString(row.catalog_id), planId: asString(row.plan_id), name: asString(row.name),
    staffingKind, statement: asString(row.statement), status: asStatus(row.status), revision: asNumber(row.revision), updatedAt: asString(row.updated_at)
  };
}

function literalIlike(column: string, value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/[%_*]/g, "\\$&").replace(/"/g, '\\"');
  return `${column}=ilike.${encodeURIComponent(`"${escaped}"`)}`;
}

function searchOr(query: string, columns: string[]): string {
  if (!query) return "";
  const q = query.replace(/\\/g, "\\\\").replace(/[%_*]/g, "\\$&").replace(/"/g, '\\"');
  const clause = `(${columns.map((column) => `${column}.ilike."%${q}%"`).join(",")})`;
  return `&or=${encodeURIComponent(clause)}`;
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("23505") || message.toLowerCase().includes("duplicate")) throw new Error("Revision conflict");
    throw error;
  }
}

const returning = { Prefer: "return=representation" };

export class SupabaseQueueStore implements QueueStore {
  constructor(private readonly ownerId: string, private readonly db: QueueDb) {}

  private async rows<T>(pathname: string, map: (row: Row) => T | null, options?: RequestInit): Promise<T[]> {
    const result = await this.db<Row[]>(pathname, options);
    return (result ?? []).map(map).filter((row): row is T => row != null);
  }

  async listCatalogs(offset: number) {
    return this.rows(`/rest/v1/response_catalogs?select=id,name,description,updated_at&order=updated_at.desc,id&limit=50&offset=${offset}`, mapCatalog);
  }
  async createCatalog(name: string, description: string | null) {
    const rows = await guard(() => this.rows("/rest/v1/response_catalogs", mapCatalog, {
      method: "POST", headers: returning,
      body: JSON.stringify({ owner_id: this.ownerId, name, description, updated_at: new Date().toISOString() })
    }));
    if (!rows[0]) throw new Error("Catalog not found");
    return rows[0];
  }
  async getCatalog(catalogId: string) {
    const rows = await this.rows(`/rest/v1/response_catalogs?id=eq.${catalogId}&select=id,name,description,updated_at`, mapCatalog);
    return rows[0] ?? null;
  }
  async touchCatalog(catalogId: string) {
    await this.db(`/rest/v1/response_catalogs?id=eq.${catalogId}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ updated_at: new Date().toISOString() })
    });
  }
  async deleteCatalog(catalogId: string) {
    const catalog = await this.getCatalog(catalogId);
    if (!catalog) return false;
    await this.db(`/rest/v1/response_catalogs?id=eq.${catalogId}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    return true;
  }
  async exportCatalog(catalogId: string) {
    const catalog = await this.getCatalog(catalogId);
    if (!catalog) return null;
    const [plans, replyWindows, channels, staffingPromises] = await Promise.all([
      this.rows(`/rest/v1/customer_plans?catalog_id=eq.${catalogId}&select=*&order=name,id&limit=200`, mapPlan),
      this.rows(`/rest/v1/reply_windows?catalog_id=eq.${catalogId}&select=*&order=within_minutes.asc,id&limit=1000`, mapWindow),
      this.rows(`/rest/v1/plan_channels?catalog_id=eq.${catalogId}&select=*&order=channel,id&limit=500`, mapChannel),
      this.rows(`/rest/v1/staffing_promises?catalog_id=eq.${catalogId}&select=*&order=staffing_kind,id&limit=500`, mapStaffing)
    ]);
    return { catalog, plans, replyWindows, channels, staffingPromises };
  }
  async findPlan(catalogId: string, name: string) {
    const rows = await this.rows(`/rest/v1/customer_plans?catalog_id=eq.${catalogId}&${literalIlike("name", name)}&select=*&limit=1`, mapPlan);
    return rows[0] ?? null;
  }
  async getPlan(planId: string) {
    const rows = await this.rows(`/rest/v1/customer_plans?id=eq.${planId}&select=*`, mapPlan);
    return rows[0] ?? null;
  }
  async insertPlan(row: CustomerPlanRecord) {
    const rows = await guard(() => this.rows("/rest/v1/customer_plans", mapPlan, { method: "POST", headers: returning, body: JSON.stringify(planPayload(row)) }));
    if (!rows[0]) throw new Error("Catalog not found");
    return rows[0];
  }
  async updatePlan(row: CustomerPlanRecord, expectedRevision: number) {
    const rows = await this.rows(`/rest/v1/customer_plans?id=eq.${row.id}&revision=eq.${expectedRevision}`, mapPlan, {
      method: "PATCH", headers: returning, body: JSON.stringify(planPayload(row))
    });
    return rows[0] ?? null;
  }
  listPlans(catalogId: string, offset: number, query: string, includeRetired: boolean) {
    const status = includeRetired ? "" : "&status=eq.APPROVED";
    return this.rows(`/rest/v1/customer_plans?catalog_id=eq.${catalogId}${status}&select=*&order=updated_at.desc,id&limit=50&offset=${offset}${searchOr(query, ["name", "summary"])}`, mapPlan);
  }
  listPlansForRank(catalogId: string) {
    return this.rows(`/rest/v1/customer_plans?catalog_id=eq.${catalogId}&status=eq.APPROVED&select=*&order=updated_at.desc,id&limit=1000`, mapPlan);
  }
  async findWindow(planId: string, name: string) {
    const rows = await this.rows(`/rest/v1/reply_windows?plan_id=eq.${planId}&${literalIlike("name", name)}&select=*&limit=1`, mapWindow);
    return rows[0] ?? null;
  }
  async insertWindow(row: ReplyWindowRecord) {
    const rows = await guard(() => this.rows("/rest/v1/reply_windows", mapWindow, { method: "POST", headers: returning, body: JSON.stringify(windowPayload(row)) }));
    if (!rows[0]) throw new Error("Plan not found");
    return rows[0];
  }
  async updateWindow(row: ReplyWindowRecord, expectedRevision: number) {
    const rows = await this.rows(`/rest/v1/reply_windows?id=eq.${row.id}&revision=eq.${expectedRevision}`, mapWindow, {
      method: "PATCH", headers: returning, body: JSON.stringify(windowPayload(row))
    });
    return rows[0] ?? null;
  }
  listWindows(planId: string, includeRetired: boolean) {
    const status = includeRetired ? "" : "&status=eq.APPROVED";
    return this.rows(`/rest/v1/reply_windows?plan_id=eq.${planId}${status}&select=*&order=within_minutes.asc,id&limit=100`, mapWindow);
  }
  listWindowsForCatalog(catalogId: string) {
    return this.rows(`/rest/v1/reply_windows?catalog_id=eq.${catalogId}&status=eq.APPROVED&select=*&order=within_minutes.asc,id&limit=1000`, mapWindow);
  }
  async findChannel(planId: string, channel: ChannelKey) {
    const rows = await this.rows(`/rest/v1/plan_channels?plan_id=eq.${planId}&channel=eq.${channel}&select=*&limit=1`, mapChannel);
    return rows[0] ?? null;
  }
  async insertChannel(row: PlanChannelRecord) {
    const rows = await guard(() => this.rows("/rest/v1/plan_channels", mapChannel, { method: "POST", headers: returning, body: JSON.stringify(channelPayload(row)) }));
    if (!rows[0]) throw new Error("Plan not found");
    return rows[0];
  }
  async updateChannel(row: PlanChannelRecord, expectedRevision: number) {
    const rows = await this.rows(`/rest/v1/plan_channels?id=eq.${row.id}&revision=eq.${expectedRevision}`, mapChannel, {
      method: "PATCH", headers: returning, body: JSON.stringify(channelPayload(row))
    });
    return rows[0] ?? null;
  }
  listChannels(planId: string, includeRetired: boolean) {
    const status = includeRetired ? "" : "&status=eq.APPROVED";
    return this.rows(`/rest/v1/plan_channels?plan_id=eq.${planId}${status}&select=*&order=channel,id&limit=20`, mapChannel);
  }
  listChannelsForCatalog(catalogId: string) {
    return this.rows(`/rest/v1/plan_channels?catalog_id=eq.${catalogId}&status=eq.APPROVED&select=*&order=channel,id&limit=1000`, mapChannel);
  }
  async findStaffing(planId: string, kind: StaffingKind) {
    const rows = await this.rows(`/rest/v1/staffing_promises?plan_id=eq.${planId}&staffing_kind=eq.${kind}&select=*&limit=1`, mapStaffing);
    return rows[0] ?? null;
  }
  async insertStaffing(row: StaffingPromiseRecord) {
    const rows = await guard(() => this.rows("/rest/v1/staffing_promises", mapStaffing, { method: "POST", headers: returning, body: JSON.stringify(staffingPayload(row)) }));
    if (!rows[0]) throw new Error("Plan not found");
    return rows[0];
  }
  async updateStaffing(row: StaffingPromiseRecord, expectedRevision: number) {
    const rows = await this.rows(`/rest/v1/staffing_promises?id=eq.${row.id}&revision=eq.${expectedRevision}`, mapStaffing, {
      method: "PATCH", headers: returning, body: JSON.stringify(staffingPayload(row))
    });
    return rows[0] ?? null;
  }
  listStaffing(planId: string, includeRetired: boolean) {
    const status = includeRetired ? "" : "&status=eq.APPROVED";
    return this.rows(`/rest/v1/staffing_promises?plan_id=eq.${planId}${status}&select=*&order=staffing_kind,id&limit=10`, mapStaffing);
  }
  listStaffingForCatalog(catalogId: string) {
    return this.rows(`/rest/v1/staffing_promises?catalog_id=eq.${catalogId}&status=eq.APPROVED&select=*&order=staffing_kind,id&limit=1000`, mapStaffing);
  }
}

function planPayload(row: CustomerPlanRecord) {
  return { id: row.id, catalog_id: row.catalogId, name: row.name, summary: row.summary, status: row.status, revision: row.revision, updated_at: row.updatedAt };
}
function windowPayload(row: ReplyWindowRecord) {
  return {
    id: row.id, catalog_id: row.catalogId, plan_id: row.planId, name: row.name, within_minutes: row.withinMinutes,
    statement: row.statement, status: row.status, revision: row.revision, updated_at: row.updatedAt
  };
}
function channelPayload(row: PlanChannelRecord) {
  return {
    id: row.id, catalog_id: row.catalogId, plan_id: row.planId, name: row.name, channel: row.channel,
    statement: row.statement, status: row.status, revision: row.revision, updated_at: row.updatedAt
  };
}
function staffingPayload(row: StaffingPromiseRecord) {
  return {
    id: row.id, catalog_id: row.catalogId, plan_id: row.planId, name: row.name, staffing_kind: row.staffingKind,
    statement: row.statement, status: row.status, revision: row.revision, updated_at: row.updatedAt
  };
}
