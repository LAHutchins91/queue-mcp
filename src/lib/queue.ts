import type {
  ChannelKey,
  CustomerPlanRecord,
  PlanChannelRecord,
  ReplyWindowRecord,
  StaffingKind,
  StaffingPromiseRecord
} from "./store.js";

export type PromiseKind = "REPLY_WINDOW" | "CHANNEL" | "STAFFING";
export type CoverageAction = "STATE_REPLY" | "OFFER_CHANNEL" | "OFFER_STAFFING";

export type PromiseVerdict = {
  kind: PromiseKind;
  decision: "APPROVED" | "REFUSED";
  allowed: boolean;
  sayOnly: string | null;
  matchedRuleId: string | null;
  matchedName: string | null;
  planId: string | null;
  planName: string | null;
  fasterThanApproved: boolean;
  channelMissing: boolean;
  dedicatedAgentMissing: boolean;
  approvedStatements?: string[];
  moreApprovedMayExist?: boolean;
  instruction: string;
};

export type CoverageVerdict = {
  decision: "APPROVED" | "REFUSED";
  allowed: boolean;
  action: CoverageAction;
  channel: ChannelKey | null;
  staffingKind: StaffingKind | null;
  instruction: string;
};

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 30 + 10,
  fortyfive: 45,
  fifty: 50,
  sixty: 60
};

const CHANNEL_DETECTORS: Array<{ channel: ChannelKey; pattern: RegExp }> = [
  { channel: "email", pattern: /\be-?mails?\b|\binbox\b/ },
  { channel: "chat", pattern: /\blive chat\b|\bin-app chat\b|\bweb chat\b|\bchats?\b/ },
  { channel: "phone", pattern: /\bphones?\b|\btelephone\b|\bphone calls?\b|\bcall you\b|\bvoice calls?\b/ },
  { channel: "sms", pattern: /\bsms\b|\btext messages?\b|\btext you\b/ },
  { channel: "video", pattern: /\bvideo calls?\b|\bvideo chats?\b|\bzoom\b|\bscreenshares?\b|\bscreen shares?\b/ }
];

const DEDICATED_PROMISE = /\b(dedicated\s+(?:support\s+)?(?:agent|rep|representative|specialist|manager)|personal\s+(?:support\s+)?(?:agent|rep|representative)|named\s+agent|your\s+own\s+agent|assigned\s+account\s+manager)\b/;

export function normalizePromise(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim().replace(/[.!?]+$/g, "");
}

function unitToMinutes(count: number, qualifier: string, unit: string): number | null {
  const business = qualifier.startsWith("business");
  if (/^minutes?$|^mins?$/.test(unit)) return count;
  if (/^hours?$|^hrs?$/.test(unit)) return count * 60;
  if (/^days?$/.test(unit)) return count * (business ? 480 : 1440);
  if (/^weeks?$/.test(unit)) return count * (business ? 2400 : 10080);
  return null;
}

/** Shortest wait a proposal claims, in minutes. Immediate language is zero. */
export function claimedWaitMinutes(value: string): number | null {
  const text = value.normalize("NFKC").toLocaleLowerCase().replace(/[-‐‑]/g, " ");
  let shortest: number | null = null;
  const consider = (minutes: number) => {
    shortest = shortest == null ? minutes : Math.min(shortest, minutes);
  };
  if (/\b(immediately|instantly|instant|asap|right away|right now)\b/.test(text)) consider(0);
  if (/\bwithin the hour\b/.test(text)) consider(60);
  if (/\bhalf an hour\b/.test(text)) consider(30);
  if (/\b(same day|today|next business day)\b/.test(text)) consider(480);
  if (/\b(tomorrow|next day)\b/.test(text)) consider(1440);
  if (/\bnext week\b/.test(text)) consider(10080);
  const pattern = /\b(?:(\d+)|(?:(a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|thirty|forty|forty five|fifty|sixty)))\s+((?:business|calendar)\s+)?(minutes?|mins?|hours?|hrs?|days?|weeks?)\b/g;
  for (const match of text.matchAll(pattern)) {
    const rawWord = match[2]?.replace(/\s+/g, "") ?? "";
    const count = match[1] ? Number(match[1]) : NUMBER_WORDS[rawWord];
    if (count == null || !Number.isFinite(count)) continue;
    const minutes = unitToMinutes(count, (match[3] ?? "").trim(), match[4]);
    if (minutes != null) consider(minutes);
  }
  return shortest;
}

export function assertReplyStatementNotFaster(statement: string, withinMinutes: number): void {
  const claimed = claimedWaitMinutes(statement);
  if (claimed != null && claimed < withinMinutes) {
    throw new Error("Reply statement is faster than the approved wait");
  }
}

export function promisesDedicatedAgent(value: string): boolean {
  const normalized = normalizePromise(value)
    .replace(/\b(?:no|not|without|never)\s+(?:a\s+|an\s+)?dedicated\b/g, " ")
    .replace(/\bdo not (?:have|get|offer|promise|assign)\s+(?:a\s+|an\s+)?dedicated\b/g, " ")
    .replace(/\bnot\s+include\s+(?:a\s+|an\s+)?dedicated\b/g, " ");
  return DEDICATED_PROMISE.test(normalized);
}

export function mentionedChannels(value: string): ChannelKey[] {
  const text = normalizePromise(value);
  const found: ChannelKey[] = [];
  for (const detector of CHANNEL_DETECTORS) {
    if (detector.pattern.test(text) && !found.includes(detector.channel)) found.push(detector.channel);
  }
  return found;
}

function refused(kind: PromiseKind, instruction: string, partial: Partial<PromiseVerdict> = {}): PromiseVerdict {
  return {
    kind,
    decision: "REFUSED",
    allowed: false,
    sayOnly: null,
    matchedRuleId: null,
    matchedName: null,
    planId: null,
    planName: null,
    fasterThanApproved: false,
    channelMissing: false,
    dedicatedAgentMissing: false,
    instruction,
    ...partial
  };
}

function approvedWindows(rows: ReplyWindowRecord[]): ReplyWindowRecord[] {
  return rows.filter((row) => row.status === "APPROVED" && row.statement.trim() && row.withinMinutes > 0);
}

function approvedChannels(rows: PlanChannelRecord[]): PlanChannelRecord[] {
  return rows.filter((row) => row.status === "APPROVED" && row.statement.trim());
}

function approvedStaffing(rows: StaffingPromiseRecord[]): StaffingPromiseRecord[] {
  return rows.filter((row) => row.status === "APPROVED" && row.statement.trim());
}

function fastestWindow(rows: ReplyWindowRecord[]): ReplyWindowRecord | null {
  return approvedWindows(rows).reduce<ReplyWindowRecord | null>((best, row) => {
    if (!best || row.withinMinutes < best.withinMinutes) return row;
    return best;
  }, null);
}

function listStatements(statements: string[]): { approvedStatements: string[]; moreApprovedMayExist: boolean } {
  const approvedStatements = statements.slice(0, 20);
  return { approvedStatements, moreApprovedMayExist: statements.length > approvedStatements.length };
}

function planFields(plan: CustomerPlanRecord | null): Pick<PromiseVerdict, "planId" | "planName"> {
  return { planId: plan?.id ?? null, planName: plan?.name ?? null };
}

export function evaluateSupportPromise(input: {
  kind: PromiseKind;
  proposal: string;
  plan: CustomerPlanRecord | null;
  windows: ReplyWindowRecord[];
  channels: PlanChannelRecord[];
  staffing: StaffingPromiseRecord[];
}): PromiseVerdict {
  const { kind, proposal, plan } = input;
  if (!plan || plan.status !== "APPROVED") {
    return refused(kind, "REFUSED. This customer plan is not approved. Do not state a reply window, a channel, or a staffing promise for it.", planFields(plan));
  }
  const windows = approvedWindows(input.windows);
  const channels = approvedChannels(input.channels);
  const staffing = approvedStaffing(input.staffing);
  const proposalText = normalizePromise(proposal);
  const exactWindow = windows.find((row) => normalizePromise(row.statement) === proposalText);
  const exactChannel = channels.find((row) => normalizePromise(row.statement) === proposalText);
  const exactStaffing = staffing.find((row) => normalizePromise(row.statement) === proposalText);
  const exact = kind === "REPLY_WINDOW" ? exactWindow : kind === "CHANNEL" ? exactChannel : exactStaffing;
  if (exact) {
    const sayOnly = "statement" in exact ? exact.statement : "";
    return refused(
      kind,
      kind === "REPLY_WINDOW"
        ? "APPROVED. Repeat sayOnly verbatim. Do not promise a faster reply, a dedicated agent, or a channel that is not in sayOnly."
        : kind === "CHANNEL"
          ? "APPROVED. Repeat sayOnly verbatim. Do not add a channel, a faster reply, or a dedicated agent that is not in sayOnly."
          : "APPROVED. Repeat sayOnly verbatim. Do not add a dedicated agent, a faster reply, or a channel that is not in sayOnly.",
      {
        decision: "APPROVED",
        allowed: true,
        sayOnly,
        matchedRuleId: exact.id,
        matchedName: exact.name,
        ...planFields(plan)
      }
    );
  }

  const dedicated = promisesDedicatedAgent(proposal);
  const dedicatedRule = staffing.find((row) => row.staffingKind === "DEDICATED_AGENT");
  if (dedicated && !dedicatedRule) {
    return refused(
      kind,
      "REFUSED. Do not promise a dedicated agent. This plan does not include one. Do not invent a staffing promise.",
      { dedicatedAgentMissing: true, ...planFields(plan) }
    );
  }

  const named = mentionedChannels(proposal);
  const allowedChannelKeys = new Set(channels.map((row) => row.channel));
  const missing = named.filter((channel) => !allowedChannelKeys.has(channel));
  if (missing.length) {
    return refused(
      kind,
      `REFUSED. This plan does not include ${missing.join(", ")}. Do not offer that channel, and do not swap in a different one.`,
      { channelMissing: true, ...planFields(plan), ...listStatements(channels.map((row) => row.statement)) }
    );
  }

  const fastest = fastestWindow(windows);
  const claimed = claimedWaitMinutes(proposal);
  if (claimed != null && fastest && claimed < fastest.withinMinutes) {
    return refused(
      kind,
      "REFUSED. Do not promise a faster reply. The fastest approved reply window for this plan is sayOnly. Say that verbatim only when evaluate_support_promise returns APPROVED for that exact text. Do not shorten it.",
      {
        fasterThanApproved: true,
        sayOnly: fastest.statement,
        matchedRuleId: fastest.id,
        matchedName: fastest.name,
        ...planFields(plan)
      }
    );
  }
  if (kind === "REPLY_WINDOW" && claimed != null && !fastest) {
    return refused(
      kind,
      "REFUSED. No approved reply window exists for this plan. Do not invent one, and do not promise a faster reply.",
      planFields(plan)
    );
  }

  if (kind === "REPLY_WINDOW") {
    return refused(
      kind,
      windows.length
        ? "REFUSED. This reply window is not in the approved set for this plan. Do not say it and do not invent a faster reply. You may only say a statement in approvedStatements, verbatim, after evaluate_support_promise returns APPROVED for that exact text."
        : "REFUSED. No approved reply window exists for this plan. Do not invent one, and do not promise a faster reply.",
      { ...planFields(plan), ...listStatements(windows.map((row) => row.statement)) }
    );
  }
  if (kind === "CHANNEL") {
    const covered = named.length
      ? channels.filter((row) => named.includes(row.channel))
      : [];
    const sayOnly = covered.length === 1 ? covered[0].statement : null;
    return refused(
      kind,
      channels.length
        ? "REFUSED. This channel wording is not in the approved set for this plan. Do not offer a channel the plan does not include, and do not invent a new channel sentence."
        : "REFUSED. No approved channel exists for this plan. Do not offer a channel.",
      {
        ...planFields(plan),
        sayOnly,
        matchedRuleId: covered.length === 1 ? covered[0].id : null,
        matchedName: covered.length === 1 ? covered[0].name : null,
        ...listStatements(channels.map((row) => row.statement))
      }
    );
  }
  const shared = staffing.filter((row) => row.staffingKind === "SHARED_QUEUE");
  const pointed = dedicated && dedicatedRule ? dedicatedRule : shared.length === 1 ? shared[0] : null;
  return refused(
    kind,
    staffing.length
      ? "REFUSED. This staffing promise is not in the approved set for this plan. Do not promise a dedicated agent unless that exact wording is approved. Do not invent a softer staffing promise."
      : "REFUSED. No approved staffing promise exists for this plan. Do not promise a dedicated agent or a shared queue.",
    {
      ...planFields(plan),
      sayOnly: pointed?.statement ?? null,
      matchedRuleId: pointed?.id ?? null,
      matchedName: pointed?.name ?? null,
      ...listStatements(staffing.map((row) => row.statement))
    }
  );
}

export function evaluatePlanCoverage(input: {
  action: CoverageAction;
  channel?: ChannelKey;
  staffingKind?: StaffingKind;
  plan: CustomerPlanRecord | null;
  windows: ReplyWindowRecord[];
  channels: PlanChannelRecord[];
  staffing: StaffingPromiseRecord[];
}): CoverageVerdict {
  const action = input.action;
  const channel = input.channel ?? null;
  const staffingKind = input.staffingKind ?? null;
  const base = { action, channel, staffingKind };
  if (!input.plan || input.plan.status !== "APPROVED") {
    return {
      ...base,
      decision: "REFUSED",
      allowed: false,
      instruction: "REFUSED. This customer plan is not approved. Do not state a reply window, a channel, or a staffing promise for it."
    };
  }
  if (action === "STATE_REPLY") {
    const windows = approvedWindows(input.windows);
    if (!windows.length) {
      return {
        ...base,
        decision: "REFUSED",
        allowed: false,
        instruction: "REFUSED. This plan has no approved reply window. Do not invent one, and do not promise a faster reply."
      };
    }
    return {
      ...base,
      decision: "APPROVED",
      allowed: true,
      instruction: "APPROVED. This plan has an approved reply window. State a reply time only when evaluate_support_promise returns APPROVED for the exact wording. Do not promise a faster reply."
    };
  }
  if (action === "OFFER_CHANNEL") {
    if (!channel) {
      return {
        ...base,
        decision: "REFUSED",
        allowed: false,
        instruction: "REFUSED. Name a channel. A missing channel is not permission to offer one."
      };
    }
    const match = approvedChannels(input.channels).find((row) => row.channel === channel);
    if (!match) {
      return {
        ...base,
        decision: "REFUSED",
        allowed: false,
        instruction: `REFUSED. This plan does not include ${channel}. Do not offer that channel.`
      };
    }
    return {
      ...base,
      decision: "APPROVED",
      allowed: true,
      instruction: `APPROVED. This plan includes ${channel}. State it only when evaluate_support_promise returns APPROVED for the exact channel wording. Do not offer a channel that is not included.`
    };
  }
  if (!staffingKind) {
    return {
      ...base,
      decision: "REFUSED",
      allowed: false,
      instruction: "REFUSED. Name the staffing promise. A missing promise is not permission to offer a dedicated agent."
    };
  }
  const match = approvedStaffing(input.staffing).find((row) => row.staffingKind === staffingKind);
  if (!match) {
    const noun = staffingKind === "DEDICATED_AGENT" ? "a dedicated agent" : "a shared queue";
    return {
      ...base,
      decision: "REFUSED",
      allowed: false,
      instruction: `REFUSED. This plan does not include ${noun}. Do not promise one.`
    };
  }
  const noun = staffingKind === "DEDICATED_AGENT" ? "a dedicated agent" : "a shared queue";
  return {
    ...base,
    decision: "APPROVED",
    allowed: true,
    instruction: `APPROVED. This plan includes ${noun}. State it only when evaluate_support_promise returns APPROVED for the exact staffing wording. Do not invent a different staffing promise.`
  };
}

export function selectCustomerPlans<T extends { status: string; name: string; summary: string; searchText: string }>(
  query: string,
  rows: T[],
  limit: number
): T[] {
  const words = new Set(query.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
  return rows
    .filter((row) => row.status === "APPROVED")
    .map((row, index) => {
      const hay = new Set(`${row.name} ${row.summary} ${row.searchText}`.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
      let score = 0;
      for (const word of words) if (word.length > 2 && hay.has(word)) score += 3;
      if (row.summary.length > 8 && query.toLocaleLowerCase().includes(row.summary.toLocaleLowerCase())) score += 20;
      if (row.name.length > 2 && query.toLocaleLowerCase().includes(row.name.toLocaleLowerCase())) score += 12;
      return { row, index, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((item) => item.row);
}
