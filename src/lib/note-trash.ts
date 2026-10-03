// Shared access gate: is a note in the owner's trash (or gone)? A trashed note
// must be unreachable through every recipient path — the shared-link view,
// saveSharedNote, the Yjs collab doc, and chat (send + media) — and access must
// return on its own when the owner restores it. We gate on the LIVE deleted_at
// rather than tearing down the share rows, so restore is automatic (A4).
//
// Not a "use server" module: it takes a service-role client and is only called
// from server actions.

// A service-role Supabase client (loosely typed — the concrete builder's chain
// types vary and don't matter here). Tests pass a small chainable fake.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SvcLike = { from: (table: string) => any };

// True when the note is trashed or missing. Redis-stored notes have no
// deleted_at column here, so they're treated as not-trashed (their lifecycle is
// handled elsewhere). A missing row counts as unreachable.
export async function noteIsTrashed(svc: SvcLike, noteId: string, storage?: string | null): Promise<boolean> {
  if (!noteId) return true;
  if (storage === "redis") return false;
  try {
    const { data } = await svc.from("notes").select("deleted_at").eq("id", noteId).maybeSingle();
    if (!data) return true;
    return !!data.deleted_at;
  } catch {
    // On a lookup error, fail closed — don't hand out access we couldn't verify.
    return true;
  }
}
