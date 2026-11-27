// Client-side loader for the collaborative Yjs doc. Hits the /api/collab Route
// Handler (a plain fetch) instead of the loadCollabDoc server action, so the
// load runs concurrently rather than queued behind other server actions.
//
// "No doc yet" and "couldn't load" are different answers and must stay so: the
// editor seeds a fresh doc only on the first, and on the second it never binds
// (the owner stays on the plain, conflict-checked editor; a collaborator waits
// and retries).
export type CollabLoadResult = { ok: true; state: string | null } | { ok: false };

export async function fetchCollabState(target: {
  shortcode?: string;
  noteId?: string;
}): Promise<CollabLoadResult> {
  const qs = target.shortcode
    ? `shortcode=${encodeURIComponent(target.shortcode)}`
    : `noteId=${encodeURIComponent(target.noteId ?? "")}`;
  try {
    const res = await fetch(`/api/collab?${qs}`, { cache: "no-store" });
    if (!res.ok) return { ok: false };
    const data = await res.json();
    if (!data || data.ok !== true) return { ok: false };
    return { ok: true, state: (data.state as string | null) ?? null };
  } catch {
    return { ok: false };
  }
}
