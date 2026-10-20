import { createServiceRoleClient } from "@/utils/supabase/server";
import { noteIsTrashed } from "@/lib/note-trash";

type Svc = ReturnType<typeof createServiceRoleClient>;

// Participants = the note's owner, or anyone it's shared with. A trashed note
// has no reachable chat for anyone until restored (A4). Shared by chatActions
// (every chat path) and the chat-unread route handler.
export async function isParticipant(svc: Svc, noteId: string, uid: string): Promise<boolean> {
  if (await noteIsTrashed(svc, noteId)) return false;
  const { data: note } = await svc.from("notes").select("author").eq("id", noteId).maybeSingle();
  if ((note as any)?.author === uid) return true;
  const { data: shares } = await svc.from("shared_notes").select("id").eq("note_id", noteId);
  const shareIds = ((shares as any[]) || []).map((s) => s.id);
  if (shareIds.length === 0) return false;
  const { data: reader } = await svc
    .from("shared_notes_readers")
    .select("id")
    .in("shared_note", shareIds)
    .eq("reader_id", uid)
    .limit(1);
  return !!(reader && (reader as any[]).length > 0);
}

// Unread chat messages for `userId` on `noteId` (from others, since their last
// read). Service-role client gated by the manual isParticipant check.
export async function getChatUnreadFor(noteId: string, userId: string): Promise<number> {
  if (!noteId || !userId) return 0;
  const svc = createServiceRoleClient();
  if (!(await isParticipant(svc, noteId, userId))) return 0;

  const { data: read } = await svc
    .from("note_chat_reads")
    .select("last_read_at")
    .eq("note_id", noteId)
    .eq("user_id", userId)
    .maybeSingle();
  const lastRead = (read as any)?.last_read_at as string | undefined;

  let q = svc
    .from("note_chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("note_id", noteId)
    .is("deleted_at", null)
    .neq("author_id", userId);
  if (lastRead) q = q.gt("created_at", lastRead);
  const { count } = await q;
  return count ?? 0;
}
