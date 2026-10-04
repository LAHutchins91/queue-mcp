import { describe, expect, it } from "vitest";
import {
  assertReplyStatementNotFaster,
  claimedWaitMinutes,
  evaluatePlanCoverage,
  evaluateSupportPromise,
  promisesDedicatedAgent
} from "../src/lib/queue.js";
import type { CustomerPlanRecord, PlanChannelRecord, ReplyWindowRecord, StaffingPromiseRecord } from "../src/lib/store.js";

const plan = (partial: Partial<CustomerPlanRecord> = {}): CustomerPlanRecord => ({
  id: "plan-1",
  catalogId: "catalog",
  name: "Starter",
  summary: "Self-serve teams on the starter plan",
  status: "APPROVED",
  revision: 1,
  updatedAt: "2026-10-04T00:00:00.000Z",
  ...partial
});

const window = (partial: Partial<ReplyWindowRecord> = {}): ReplyWindowRecord => ({
  id: "window-1",
  catalogId: "catalog",
  planId: "plan-1",
  name: "Business day",
  withinMinutes: 480,
  statement: "We reply within one business day.",
  status: "APPROVED",
  revision: 1,
  updatedAt: "2026-10-04T00:00:00.000Z",
  ...partial
});

const email = (partial: Partial<PlanChannelRecord> = {}): PlanChannelRecord => ({
  id: "channel-1",
  catalogId: "catalog",
  planId: "plan-1",
  name: "Email",
  channel: "email",
  statement: "Email is included on this plan.",
  status: "APPROVED",
  revision: 1,
  updatedAt: "2026-10-04T00:00:00.000Z",
  ...partial
});

const shared = (partial: Partial<StaffingPromiseRecord> = {}): StaffingPromiseRecord => ({
  id: "staff-1",
  catalogId: "catalog",
  planId: "plan-1",
  name: "Shared queue",
  staffingKind: "SHARED_QUEUE",
  statement: "Replies come from the shared queue.",
  status: "APPROVED",
  revision: 1,
  updatedAt: "2026-10-04T00:00:00.000Z",
  ...partial
});

function decide(kind: "REPLY_WINDOW" | "CHANNEL" | "STAFFING", proposal: string, extra: {
  windows?: ReplyWindowRecord[];
  channels?: PlanChannelRecord[];
  staffing?: StaffingPromiseRecord[];
  plan?: CustomerPlanRecord | null;
} = {}) {
  return evaluateSupportPromise({
    kind,
    proposal,
    plan: extra.plan === undefined ? plan() : extra.plan,
    windows: extra.windows ?? [window()],
    channels: extra.channels ?? [email()],
    staffing: extra.staffing ?? [shared()]
  });
}

describe("reply windows", () => {
  it("measures a faster claim as a shorter wait", () => {
    expect(claimedWaitMinutes("We will reply within one hour")).toBe(60);
    expect(claimedWaitMinutes("immediately")).toBe(0);
    expect(claimedWaitMinutes("We reply within one business day.")).toBe(480);
  });

  it("refuses a faster reply and approves the exact window", () => {
    const faster = decide("REPLY_WINDOW", "We will reply within one hour.");
    expect(faster.decision).toBe("REFUSED");
    expect(faster.fasterThanApproved).toBe(true);
    expect(faster.sayOnly).toBe("We reply within one business day.");

    const approved = decide("REPLY_WINDOW", "We reply within one business day.");
    expect(approved.decision).toBe("APPROVED");
    expect(approved.sayOnly).toBe("We reply within one business day.");
  });

  it("refuses a slower reply that was never approved", () => {
    const slower = decide("REPLY_WINDOW", "We reply within thirty business days.");
    expect(slower.decision).toBe("REFUSED");
    expect(slower.fasterThanApproved).toBe(false);
    expect(slower.sayOnly).toBeNull();
  });

  it("rejects a saved statement that is faster than its wait", () => {
    expect(() => assertReplyStatementNotFaster("We reply within 15 minutes.", 480)).toThrow(/faster than the approved wait/);
    expect(() => assertReplyStatementNotFaster("We reply within one business day.", 480)).not.toThrow();
  });
});

describe("channels and staffing", () => {
  it("refuses a channel the plan does not include", () => {
    const verdict = decide("CHANNEL", "We can call you on the phone.");
    expect(verdict.decision).toBe("REFUSED");
    expect(verdict.channelMissing).toBe(true);
    expect(verdict.sayOnly).toBeNull();
  });

  it("approves only the stored channel wording", () => {
    const approved = decide("CHANNEL", "Email is included on this plan.");
    expect(approved.decision).toBe("APPROVED");
    const paraphrase = decide("CHANNEL", "You can email the support inbox any time.");
    expect(paraphrase.decision).toBe("REFUSED");
    expect(paraphrase.channelMissing).toBe(false);
    expect(paraphrase.sayOnly).toBe("Email is included on this plan.");
  });

  it("refuses a dedicated agent the plan does not include", () => {
    expect(promisesDedicatedAgent("You will have a dedicated agent.")).toBe(true);
    expect(promisesDedicatedAgent("This plan does not include a dedicated agent.")).toBe(false);
    const verdict = decide("STAFFING", "You will have a dedicated agent.");
    expect(verdict.decision).toBe("REFUSED");
    expect(verdict.dedicatedAgentMissing).toBe(true);
  });

  it("approves a dedicated agent only when that promise is stored", () => {
    const statement = "This plan includes a dedicated agent.";
    const dedicated: StaffingPromiseRecord = {
      ...shared(),
      id: "staff-2",
      staffingKind: "DEDICATED_AGENT",
      name: "Dedicated",
      statement
    };
    const approved = decide("STAFFING", statement, { staffing: [shared(), dedicated] });
    expect(approved.decision).toBe("APPROVED");
    expect(approved.dedicatedAgentMissing).toBe(false);
  });
});

describe("plan coverage", () => {
  it("refuses phone and a dedicated agent, and allows a saved reply window", () => {
    const input = { plan: plan(), windows: [window()], channels: [email()], staffing: [shared()] };
    expect(evaluatePlanCoverage({ ...input, action: "OFFER_CHANNEL", channel: "phone" }).decision).toBe("REFUSED");
    expect(evaluatePlanCoverage({ ...input, action: "OFFER_CHANNEL", channel: "email" }).decision).toBe("APPROVED");
    expect(evaluatePlanCoverage({ ...input, action: "OFFER_STAFFING", staffingKind: "DEDICATED_AGENT" }).decision).toBe("REFUSED");
    expect(evaluatePlanCoverage({ ...input, action: "OFFER_STAFFING", staffingKind: "SHARED_QUEUE" }).decision).toBe("APPROVED");
    expect(evaluatePlanCoverage({ ...input, action: "STATE_REPLY" }).decision).toBe("APPROVED");
  });

  it("refuses every promise when the plan is not approved", () => {
    const verdict = decide("REPLY_WINDOW", "We reply within one business day.", { plan: plan({ status: "RETIRED" }) });
    expect(verdict.decision).toBe("REFUSED");
    expect(verdict.allowed).toBe(false);
  });
});
