// Client loader for a note's chat unread count — hits /api/chat-unread (plain
// fetch) so it doesn't queue behind other server actions.
export async function fetchChatUnread(noteId: string): Promise<number> {
  if (!noteId) return 0;
  try {
    const res = await fetch(`/api/chat-unread?noteId=${encodeURIComponent(noteId)}`, {
      cache: "no-store",
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return (data?.unread as number) ?? 0;
  } catch {
    return 0;
  }
}
