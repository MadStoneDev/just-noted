// Client-side loader for the collaborative Yjs doc. Hits the /api/collab Route
// Handler (a plain fetch) instead of the loadCollabDoc server action, so the
// load runs concurrently rather than queued behind other server actions.
export async function fetchCollabState(target: {
  shortcode?: string;
  noteId?: string;
}): Promise<string | null> {
  const qs = target.shortcode
    ? `shortcode=${encodeURIComponent(target.shortcode)}`
    : `noteId=${encodeURIComponent(target.noteId ?? "")}`;
  try {
    const res = await fetch(`/api/collab?${qs}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.state as string | null) ?? null;
  } catch {
    return null;
  }
}
