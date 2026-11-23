// B7 — cross-account write guard for the offline queue.
//
// The offline queue is persisted in IndexedDB and survives a reload, including
// the full-page reload that an account switch performs. Supabase (cloud) ops are
// authorised server-side by the CURRENT cookie session, not by the `userId` baked
// into the queued op — so a queued op belonging to account A that is still in the
// queue after switching to account B would be written under B. That is the bug B7
// closes: the queue must never send a cloud op for an account that is not the one
// currently signed in.
//
// Redis ops are device-scoped (keyed by the guest `notes_user_id` in localStorage,
// which is the same device regardless of which Supabase account is signed in), so
// they are always safe to send.
//
// Kept dependency-free (no IndexedDB, no server actions, no React) so it is unit
// testable and could move into a portable sync core later.

export interface SyncOpIdentity {
  source: "redis" | "supabase";
  userId: string;
}

/**
 * Whether a queued op may be sent to the server right now.
 * - Redis ops: always (device-scoped, not account-scoped).
 * - Supabase ops: only when their owning account is the active session.
 *   A null active user (signed out, or not yet established on boot) means we do
 *   NOT send cloud ops — sending one would mis-attribute it or fail against RLS.
 */
export function shouldSyncOp(
  op: SyncOpIdentity,
  activeSupabaseUserId: string | null,
): boolean {
  if (op.source === "redis") return true;
  if (!activeSupabaseUserId) return false;
  return op.userId === activeSupabaseUserId;
}

/**
 * A legacy cloud op that predates account-scoping: source "supabase" with no
 * userId. Such an op would never pass `shouldSyncOp` (its blank userId can't match
 * the active account), so it must be backfilled once with the signed-in user —
 * matching pre-guard behaviour, where any op flushed under whatever session was
 * active. Redis ops never need a tag (device-scoped).
 */
export function needsCloudUserTag(op: SyncOpIdentity): boolean {
  return op.source === "supabase" && !op.userId;
}

// Module-level "who is signed in" holder. Set by the sync layer once auth is
// established (and cleared to null when signed out). The queue reads it at drain
// time. This lives here rather than in offline-queue.ts so the pure guard above
// and this trivial holder can be imported and tested without pulling in the
// queue's IndexedDB / server-action dependencies.
//
// The id is the Supabase auth user id (the account), NOT the device id the
// notes store calls `userId` (localStorage notes_user_id, the same for every
// account on this device).
let activeSupabaseUserId: string | null = null;
// The account signed in most recently in this tab. Kept after a sign-out, so a
// cloud write that fails just after the session ended (an open editor's save)
// is still queued under the account it belongs to, and parked there.
let lastSupabaseUserId: string | null = null;

export function setActiveSupabaseUser(userId: string | null): void {
  activeSupabaseUserId = userId || null;
  if (activeSupabaseUserId) lastSupabaseUserId = activeSupabaseUserId;
}

export function getActiveSupabaseUser(): string | null {
  return activeSupabaseUserId;
}

export function getLastSupabaseUser(): string | null {
  return lastSupabaseUserId;
}

/** This device's guest id (localStorage notes_user_id), or null when unknown. */
export function deviceUserId(): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem("notes_user_id") : null;
  } catch {
    return null;
  }
}

/**
 * The account a cloud op or cached cloud note belongs to, given the id it was
 * written with. Callers pass the notes store's `userId`, which is the DEVICE id;
 * for a cloud record that (or a blank) means "the account signed in now" (or,
 * just after a sign-out, the one that was). A real account id is kept as is.
 */
export function cloudAccountFor(userId: string | null | undefined): string {
  const device = deviceUserId();
  if (userId && userId !== device) return userId;
  return activeSupabaseUserId ?? lastSupabaseUserId ?? userId ?? "";
}

/**
 * A cloud op not tagged with an account: blank (queued before ops were
 * account-scoped) or tagged with the device id (queued before ops carried the
 * account id). The device id is the same for every account on the device, so
 * the guard can't tell whose it is; the next signed-in account adopts it, as
 * before account tagging.
 */
export function needsCloudAccountTag(op: SyncOpIdentity, device: string | null): boolean {
  return op.source === "supabase" && (!op.userId || (!!device && op.userId === device));
}
