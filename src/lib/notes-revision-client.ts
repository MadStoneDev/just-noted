// Client loader for the per-user notes revision (the 12s poll). Hits
// /api/notes-revision (plain fetch) so it doesn't queue behind server actions.
export async function fetchNotesRevision(userId: string): Promise<number> {
  if (!userId) return 0;
  try {
    const res = await fetch(`/api/notes-revision?userId=${encodeURIComponent(userId)}`, {
      cache: "no-store",
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return (data?.revision as number) ?? 0;
  } catch {
    return 0;
  }
}
