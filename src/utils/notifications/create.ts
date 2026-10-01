import "server-only";
import { createServiceRoleClient } from "@/utils/supabase/server";
import { prefEnabled, type NotificationType } from "@/lib/notifications";

type Svc = ReturnType<typeof createServiceRoleClient>;

/** Participants of a note = its owner + everyone it's shared with. */
export async function listNoteParticipants(svc: Svc, noteId: string): Promise<string[]> {
  const ids = new Set<string>();
  const { data: note } = await svc.from("notes").select("author").eq("id", noteId).maybeSingle();
  const owner = (note as any)?.author as string | undefined;
  if (owner) ids.add(owner);
  const { data: shares } = await svc.from("shared_notes").select("id").eq("note_id", noteId);
  const shareIds = ((shares as any[]) || []).map((s) => s.id);
  if (shareIds.length > 0) {
    const { data: readers } = await svc
      .from("shared_notes_readers")
      .select("reader_id")
      .in("shared_note", shareIds);
    for (const r of (readers as any[]) || []) if (r.reader_id) ids.add(r.reader_id);
  }
  return [...ids];
}

/** Create one notification, honouring the recipient's preference (and never
 *  notifying the actor about their own action). */
export async function createNotification(
  recipientId: string,
  type: NotificationType,
  opts: { actorId?: string | null; noteId?: string | null; data?: any; dedupeUnreadByNote?: boolean } = {},
): Promise<void> {
  if (!recipientId) return;
  if (opts.actorId && opts.actorId === recipientId) return;
  const svc = createServiceRoleClient();

  const { data: us } = await svc.from("user_settings").select("settings").eq("user_id", recipientId).maybeSingle();
  const prefs = ((us as any)?.settings?.notifications) ?? null;
  if (!prefEnabled(prefs, type)) return;

  // For chatty types, keep only one unread per (recipient, note) so the bell
  // nudges once until read rather than per message.
  if (opts.dedupeUnreadByNote && opts.noteId) {
    const { data: existing } = await svc
      .from("notifications")
      .select("id")
      .eq("user_id", recipientId)
      .eq("note_id", opts.noteId)
      .eq("type", type)
      .is("read_at", null)
      .limit(1);
    if (existing && (existing as any[]).length > 0) return;
  }

  await svc.from("notifications").insert({
    user_id: recipientId,
    type,
    actor_id: opts.actorId ?? null,
    note_id: opts.noteId ?? null,
    data: opts.data ?? null,
  } as any);
}

/** Notify every participant of a note except the actor. Best-effort. */
export async function notifyNoteParticipants(
  noteId: string,
  actorId: string,
  type: NotificationType,
  data: any,
  dedupeUnreadByNote = false,
): Promise<void> {
  try {
    const svc = createServiceRoleClient();
    const participants = await listNoteParticipants(svc, noteId);
    await Promise.all(
      participants
        .filter((uid) => uid !== actorId)
        .map((uid) => createNotification(uid, type, { actorId, noteId, data, dedupeUnreadByNote })),
    );
  } catch (e) {
    console.error("[notifications] notifyNoteParticipants failed:", e);
  }
}

async function noteContext(svc: Svc, noteId: string, actorId: string) {
  const [{ data: note }, { data: author }, { data: share }] = await Promise.all([
    svc.from("notes").select("title").eq("id", noteId).maybeSingle(),
    svc.from("authors").select("username").eq("id", actorId).maybeSingle(),
    svc.from("shared_notes").select("shortcode").eq("note_id", noteId).limit(1).maybeSingle(),
  ]);
  return {
    actorName: (author as any)?.username || "Someone",
    noteTitle: (note as any)?.title || "a note",
    shortcode: (share as any)?.shortcode as string | undefined,
  };
}

/** New chat message → nudge the other participants (one unread per note). */
export async function notifyChatMessage(noteId: string, senderId: string): Promise<void> {
  try {
    const svc = createServiceRoleClient();
    const data = await noteContext(svc, noteId, senderId);
    await notifyNoteParticipants(noteId, senderId, "chat_message", data, true);
  } catch (e) {
    console.error("[notifications] chat notify failed:", e);
  }
}

/** A note was shared with someone → notify that one recipient. */
export async function notifyNoteShared(noteId: string, actorId: string, recipientId: string): Promise<void> {
  try {
    const svc = createServiceRoleClient();
    const data = await noteContext(svc, noteId, actorId);
    await createNotification(recipientId, "shared_with_me", { actorId, noteId, data });
  } catch (e) {
    console.error("[notifications] share notify failed:", e);
  }
}

/** A reader was added to a share → notify them (resolves the note from the share). */
export async function notifyShareAdded(shareId: string, recipientId: string): Promise<void> {
  try {
    const svc = createServiceRoleClient();
    const { data: share } = await svc.from("shared_notes").select("note_id, note_owner_id").eq("id", shareId).maybeSingle();
    const noteId = (share as any)?.note_id as string | undefined;
    const actorId = (share as any)?.note_owner_id as string | undefined;
    if (!noteId || !actorId) return;
    const data = await noteContext(svc, noteId, actorId);
    await createNotification(recipientId, "shared_with_me", { actorId, noteId, data });
  } catch (e) {
    console.error("[notifications] share-added notify failed:", e);
  }
}

/** A shared note was edited → notify the other participants. */
export async function notifyNoteEdited(noteId: string, actorId: string): Promise<void> {
  try {
    const svc = createServiceRoleClient();
    const data = await noteContext(svc, noteId, actorId);
    await notifyNoteParticipants(noteId, actorId, "edited_shared_note", data, true);
  } catch (e) {
    console.error("[notifications] edit notify failed:", e);
  }
}

/** Mark a user's chat_message notifications for a note read (on markChatRead). */
export async function markChatNotificationsRead(userId: string, noteId: string): Promise<void> {
  try {
    const svc = createServiceRoleClient();
    await svc
      .from("notifications")
      .update({ read_at: new Date().toISOString() } as any)
      .eq("user_id", userId)
      .eq("note_id", noteId)
      .eq("type", "chat_message")
      .is("read_at", null);
  } catch {
    /* best-effort */
  }
}
