// Pure helpers for scheduled account deletion (so the rules are testable).

export const ACCOUNT_GRACE_DAYS = 30;
const DAY = 86400000;

/** When a deletion requested at `requestedMs` becomes eligible to purge. */
export function purgeAtFrom(requestedMs: number): number {
  return requestedMs + ACCOUNT_GRACE_DAYS * DAY;
}

/** The confirmation must exactly match the account email (case-insensitive). */
export function confirmMatchesEmail(
  input: string | null | undefined,
  email: string | null | undefined,
): boolean {
  const a = (input ?? "").trim().toLowerCase();
  const b = (email ?? "").trim().toLowerCase();
  return a.length > 0 && a === b;
}

/** Is a scheduled deletion past its grace window? */
export function isPurgeDue(purgeAtMs: number, now: number = Date.now()): boolean {
  return purgeAtMs <= now;
}
