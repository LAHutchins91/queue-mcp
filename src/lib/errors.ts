const KNOWN = [
  "Catalog not found",
  "Plan not found",
  "Revision conflict",
  "Reply statement is faster than the approved wait"
] as const;

export function publicError(error: unknown): { status: number; error: string } {
  const message = error instanceof Error ? error.message : "";
  const safe = KNOWN.find((item) => message.includes(item));
  if (safe === "Catalog not found" || safe === "Plan not found") return { status: 404, error: safe };
  if (safe === "Revision conflict") return { status: 409, error: safe };
  if (safe) return { status: 400, error: safe };
  return { status: 500, error: "Queue could not complete this request. Your changes may not have been saved." };
}
