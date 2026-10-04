import { assertReplyStatementNotFaster } from "./queue.js";
import type {
  ChannelKey,
  CustomerPlanRecord,
  PlanChannelRecord,
  QueueStore,
  RecordStatus,
  ReplyWindowRecord,
  StaffingKind,
  StaffingPromiseRecord
} from "./store.js";

type SavePlan = {
  catalogId: string;
  name: string;
  summary: string;
  status: RecordStatus;
  expectedRevision?: number;
};

type SaveWindow = {
  catalogId: string;
  planId: string;
  name: string;
  withinMinutes: number;
  statement: string;
  status: RecordStatus;
  expectedRevision?: number;
};

type SaveChannel = {
  catalogId: string;
  planId: string;
  name: string;
  channel: ChannelKey;
  statement: string;
  status: RecordStatus;
  expectedRevision?: number;
};

type SaveStaffing = {
  catalogId: string;
  planId: string;
  name: string;
  staffingKind: StaffingKind;
  statement: string;
  status: RecordStatus;
  expectedRevision?: number;
};

async function requireCatalog(store: QueueStore, catalogId: string) {
  const catalog = await store.getCatalog(catalogId);
  if (!catalog) throw new Error("Catalog not found");
  return catalog;
}

async function requirePlan(store: QueueStore, catalogId: string, planId: string) {
  await requireCatalog(store, catalogId);
  const plan = await store.getPlan(planId);
  if (!plan || plan.catalogId !== catalogId) throw new Error("Plan not found");
  return plan;
}

async function commit<T extends { id: string; revision: number; updatedAt: string }>(options: {
  existing: T | null;
  unchanged: boolean;
  expectedRevision?: number;
  next: Omit<T, "id" | "revision" | "updatedAt">;
  insert: (row: T) => Promise<T>;
  update: (row: T, expectedRevision: number) => Promise<T | null>;
  touch: () => Promise<void>;
}): Promise<T> {
  if (options.existing && options.unchanged) return options.existing;
  const now = new Date().toISOString();
  if (options.existing) {
    if (options.expectedRevision !== options.existing.revision) throw new Error("Revision conflict");
    const saved = await options.update(
      { ...options.existing, ...options.next, revision: options.existing.revision + 1, updatedAt: now } as T,
      options.existing.revision
    );
    if (!saved) throw new Error("Revision conflict");
    await options.touch();
    return saved;
  }
  if (options.expectedRevision) throw new Error("Revision conflict");
  const created = await options.insert({ ...options.next, id: crypto.randomUUID(), revision: 1, updatedAt: now } as T);
  await options.touch();
  return created;
}

export async function saveCustomerPlan(store: QueueStore, input: SavePlan): Promise<CustomerPlanRecord> {
  await requireCatalog(store, input.catalogId);
  const existing = await store.findPlan(input.catalogId, input.name);
  const next = { catalogId: input.catalogId, name: input.name.trim(), summary: input.summary.trim(), status: input.status };
  return commit({
    existing,
    unchanged: Boolean(existing && existing.name === next.name && existing.summary === next.summary && existing.status === next.status),
    expectedRevision: input.expectedRevision,
    next,
    insert: (row) => store.insertPlan(row),
    update: (row, expectedRevision) => store.updatePlan(row, expectedRevision),
    touch: () => store.touchCatalog(input.catalogId)
  });
}

export async function saveReplyWindow(store: QueueStore, input: SaveWindow): Promise<ReplyWindowRecord> {
  await requirePlan(store, input.catalogId, input.planId);
  const statement = input.statement.trim();
  assertReplyStatementNotFaster(statement, input.withinMinutes);
  const existing = await store.findWindow(input.planId, input.name);
  const next = {
    catalogId: input.catalogId,
    planId: input.planId,
    name: input.name.trim(),
    withinMinutes: input.withinMinutes,
    statement,
    status: input.status
  };
  return commit({
    existing,
    unchanged: Boolean(
      existing &&
      existing.name === next.name &&
      existing.withinMinutes === next.withinMinutes &&
      existing.statement === next.statement &&
      existing.status === next.status
    ),
    expectedRevision: input.expectedRevision,
    next,
    insert: (row) => store.insertWindow(row),
    update: (row, expectedRevision) => store.updateWindow(row, expectedRevision),
    touch: () => store.touchCatalog(input.catalogId)
  });
}

export async function savePlanChannel(store: QueueStore, input: SaveChannel): Promise<PlanChannelRecord> {
  await requirePlan(store, input.catalogId, input.planId);
  const existing = await store.findChannel(input.planId, input.channel);
  const next = {
    catalogId: input.catalogId,
    planId: input.planId,
    name: input.name.trim(),
    channel: input.channel,
    statement: input.statement.trim(),
    status: input.status
  };
  return commit({
    existing,
    unchanged: Boolean(existing && existing.name === next.name && existing.channel === next.channel && existing.statement === next.statement && existing.status === next.status),
    expectedRevision: input.expectedRevision,
    next,
    insert: (row) => store.insertChannel(row),
    update: (row, expectedRevision) => store.updateChannel(row, expectedRevision),
    touch: () => store.touchCatalog(input.catalogId)
  });
}

export async function saveStaffingPromise(store: QueueStore, input: SaveStaffing): Promise<StaffingPromiseRecord> {
  await requirePlan(store, input.catalogId, input.planId);
  const existing = await store.findStaffing(input.planId, input.staffingKind);
  const next = {
    catalogId: input.catalogId,
    planId: input.planId,
    name: input.name.trim(),
    staffingKind: input.staffingKind,
    statement: input.statement.trim(),
    status: input.status
  };
  return commit({
    existing,
    unchanged: Boolean(
      existing &&
      existing.name === next.name &&
      existing.staffingKind === next.staffingKind &&
      existing.statement === next.statement &&
      existing.status === next.status
    ),
    expectedRevision: input.expectedRevision,
    next,
    insert: (row) => store.insertStaffing(row),
    update: (row, expectedRevision) => store.updateStaffing(row, expectedRevision),
    touch: () => store.touchCatalog(input.catalogId)
  });
}
