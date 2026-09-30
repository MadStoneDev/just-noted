"use server";

import { createClient, createServiceRoleClient } from "@/utils/supabase/server";
import { ownerCanCollaborate } from "@/lib/subscription";
import { checkRateLimit } from "@/utils/rate-limit";
import { toMessageView, type ChatAuthor, type ChatMessageView, type ChatMessageRow } from "@/lib/chat";

const MAX_BODY = 4000;
// Send limit per user per note. The SQL is_note_chat_participant() is caller
// (auth.uid) scoped for RLS, so server-side participation is checked inline with
// the service role and the session's own id.
const SEND_LIMIT = 20;
const SEND_WINDOW_MS = 10_000;

async function sessionUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// Participants = the note's owner, or anyone it's shared with.
async function isParticipant(
  svc: ReturnType<typeof createServiceRoleClient>,
  noteId: string,
  uid: string,
): Promise<boolean> {
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

async function resolveAuthors(
  svc: ReturnType<typeof createServiceRoleClient>,
  ids: string[],
): Promise<Map<string, ChatAuthor>> {
  const map = new Map<string, ChatAuthor>();
  if (ids.length === 0) return map;
  const { data } = await svc.from("authors").select("id, username, avatar_url").in("id", ids);
  for (const a of (data as any[]) || []) {
    map.set(a.id, { id: a.id, username: a.username ?? "Unknown", avatarUrl: a.avatar_url ?? null });
  }
  return map;
}

/**
 * Messages for a note the caller participates in, plus whether they can send
 * (the owner's plan includes collaboration — read-only when it's lapsed).
 */
export async function listChatMessages(
  noteId: string,
  limit = 200,
): Promise<{ success: boolean; canSend: boolean; messages: ChatMessageView[] }> {
  const uid = await sessionUserId();
  if (!uid) return { success: false, canSend: false, messages: [] };
  const svc = createServiceRoleClient();
  if (!(await isParticipant(svc, noteId, uid))) return { success: false, canSend: false, messages: [] };

  const [{ data: rows }, canSend] = await Promise.all([
    svc
      .from("note_chat_messages")
      .select("*")
      .eq("note_id", noteId)
      .order("created_at", { ascending: true })
      .limit(limit),
    ownerCanCollaborate(svc, noteId),
  ]);

  const list = ((rows as ChatMessageRow[]) || []);
  const authorIds = [...new Set(list.map((r) => r.author_id).filter((x): x is string => !!x))];
  const authors = await resolveAuthors(svc, authorIds);
  const messages = list.map((r) => toMessageView(r, uid, authors));
  return { success: true, canSend, messages };
}

/** Send a text message. Gated on participation + the owner's Scribe plan. */
export async function sendChatMessage(
  noteId: string,
  body: string,
): Promise<{ success: boolean; error?: string }> {
  const uid = await sessionUserId();
  if (!uid) return { success: false, error: "Sign in to chat" };
  const text = (body || "").trim();
  if (!text) return { success: false, error: "Message is empty" };
  if (text.length > MAX_BODY) return { success: false, error: "Message is too long" };

  const svc = createServiceRoleClient();
  if (!(await isParticipant(svc, noteId, uid))) return { success: false, error: "You don't have access to this chat" };
  if (!(await ownerCanCollaborate(svc, noteId))) return { success: false, error: "Chat is read-only" };

  const rl = await checkRateLimit(uid, `chat:${noteId}`, SEND_LIMIT, SEND_WINDOW_MS);
  if (!rl.allowed) return { success: false, error: "You're sending messages too fast — slow down a moment." };

  const { error } = await svc
    .from("note_chat_messages")
    .insert({ note_id: noteId, author_id: uid, kind: "text", body: text } as any);
  return { success: !error, error: error ? "Couldn't send the message" : undefined };
}

/** Edit your own message (adds the "(edited)" marker via edited_at). */
export async function editChatMessage(
  messageId: string,
  body: string,
): Promise<{ success: boolean; error?: string }> {
  const uid = await sessionUserId();
  if (!uid) return { success: false, error: "Sign in" };
  const text = (body || "").trim();
  if (!text) return { success: false, error: "Message is empty" };
  if (text.length > MAX_BODY) return { success: false, error: "Message is too long" };

  const svc = createServiceRoleClient();
  const { data: msg } = await svc
    .from("note_chat_messages")
    .select("id, note_id, author_id, body, deleted_at")
    .eq("id", messageId)
    .maybeSingle();
  const m = msg as any;
  if (!m || m.author_id !== uid || m.deleted_at) return { success: false, error: "You can't edit this message" };
  if (!(await ownerCanCollaborate(svc, m.note_id))) return { success: false, error: "Chat is read-only" };

  // Save the previous body to the edit history before overwriting.
  if (m.body != null) {
    await svc.from("note_chat_message_versions").insert({ message_id: messageId, body: m.body } as any);
  }

  const { error } = await svc
    .from("note_chat_messages")
    .update({ body: text, edited_at: new Date().toISOString() } as any)
    .eq("id", messageId);
  return { success: !error, error: error ? "Couldn't edit the message" : undefined };
}

/**
 * Delete your own message → a "Message deleted" tombstone (row kept, content
 * cleared). Allowed even when the chat is read-only: it's your own content.
 * (Media purge from R2 arrives with the media phase.)
 */
export async function deleteOwnChatMessage(messageId: string): Promise<{ success: boolean }> {
  const uid = await sessionUserId();
  if (!uid) return { success: false };
  const svc = createServiceRoleClient();
  const { data: msg } = await svc
    .from("note_chat_messages")
    .select("id, author_id, deleted_at, media_key")
    .eq("id", messageId)
    .maybeSingle();
  const m = msg as any;
  if (!m || m.author_id !== uid) return { success: false };
  if (m.deleted_at) return { success: true };

  const { error } = await svc
    .from("note_chat_messages")
    .update({
      deleted_at: new Date().toISOString(),
      body: null,
      media_key: null,
      media_mime: null,
      media_meta: null,
      anchor: null,
    } as any)
    .eq("id", messageId);
  if (error) return { success: false };

  // Purge the edit history too — a deleted message must leave no recoverable
  // content. (Media purge from private R2 when m.media_key is set arrives with
  // the media phase; media_key is always null until then.)
  await svc.from("note_chat_message_versions").delete().eq("message_id", messageId);
  return { success: true };
}

/** Mark the note's chat read up to now (drives unread badges). */
export async function markChatRead(noteId: string): Promise<{ success: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false };
  const { error } = await supabase
    .from("note_chat_reads")
    .upsert(
      { note_id: noteId, user_id: user.id, last_read_at: new Date().toISOString() } as any,
      { onConflict: "note_id,user_id" },
    );
  return { success: !error };
}
