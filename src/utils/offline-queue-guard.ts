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
let activeSupabaseUserId: string | null = null;

export function setActiveSupabaseUser(userId: string | null): void {
  activeSupabaseUserId = userId || null;
}

export function getActiveSupabaseUser(): string | null {
  return activeSupabaseUserId;
}
