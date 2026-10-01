"use server";

import { createClient, createServiceRoleClient } from "@/utils/supabase/server";
import { ownerCanCollaborate } from "@/lib/subscription";
import { checkRateLimit } from "@/utils/rate-limit";
import { toMessageView, type ChatAuthor, type ChatMessageView, type ChatMessageRow } from "@/lib/chat";
import { validateChatMedia, baseMime } from "@/lib/chat-media";
import { notifyChatMessage, markChatNotificationsRead } from "@/utils/notifications/create";
import {
  CHAT_PREFIX,
  PRESIGN_TTL_SECONDS,
  presignPut,
  presignGet,
  headPrivateObject,
  deletePrivateObject,
} from "@/utils/storage/r2-private";

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

export interface MessageAnchorInput {
  relStart: string;
  relEnd: string;
  quote: string;
}

/** Send a text message (optionally anchored to a highlight in the note). */
export async function sendChatMessage(
  noteId: string,
  body: string,
  anchor?: MessageAnchorInput | null,
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

  // Only store a well-formed anchor with a bounded quote.
  const anchorValue =
    anchor && anchor.relStart && anchor.relEnd && anchor.quote
      ? { relStart: anchor.relStart, relEnd: anchor.relEnd, quote: String(anchor.quote).slice(0, 300) }
      : null;

  const { error } = await svc
    .from("note_chat_messages")
    .insert({ note_id: noteId, author_id: uid, kind: "text", body: text, anchor: anchorValue } as any);
  if (!error) void notifyChatMessage(noteId, uid);
  return { success: !error, error: error ? "Couldn't send the message" : undefined };
}

/**
 * Step 1 of a media send: validate + reserve a key and hand back a short-lived
 * presigned PUT URL so the (already EXIF-stripped) file uploads straight to the
 * private bucket. Gated on participation + the owner's Scribe plan.
 */
export async function requestChatMediaUpload(
  noteId: string,
  kind: string,
  mime: string,
  size: number,
): Promise<{ ok: boolean; url?: string; key?: string; error?: string }> {
  const uid = await sessionUserId();
  if (!uid) return { ok: false, error: "Sign in to chat" };
  const v = validateChatMedia(kind, mime, size);
  if (!v.ok) return { ok: false, error: v.error };

  const svc = createServiceRoleClient();
  if (!(await isParticipant(svc, noteId, uid))) return { ok: false, error: "You don't have access to this chat" };
  if (!(await ownerCanCollaborate(svc, noteId))) return { ok: false, error: "Chat is read-only" };
  const rl = await checkRateLimit(uid, `chat:${noteId}`, SEND_LIMIT, SEND_WINDOW_MS);
  if (!rl.allowed) return { ok: false, error: "You're sending messages too fast — slow down a moment." };

  const key = `${CHAT_PREFIX}${noteId}/${crypto.randomUUID()}.${v.ext}`;
  try {
    const url = await presignPut(key, baseMime(mime));
    return { ok: true, url, key };
  } catch {
    return { ok: false, error: "Uploads aren't available right now" };
  }
}

/**
 * Step 2 of a media send: after the client uploaded to the presigned URL, create
 * the message. Re-checks access, confirms the key is under this note's prefix,
 * and HEADs the object to verify it landed and matches the declared type/size.
 */
export async function sendChatMediaMessage(
  noteId: string,
  input: { key: string; kind: string; mime: string; meta?: Record<string, unknown> },
): Promise<{ success: boolean; error?: string }> {
  const uid = await sessionUserId();
  if (!uid) return { success: false, error: "Sign in to chat" };

  const svc = createServiceRoleClient();
  if (!(await isParticipant(svc, noteId, uid))) return { success: false, error: "You don't have access to this chat" };
  if (!(await ownerCanCollaborate(svc, noteId))) return { success: false, error: "Chat is read-only" };

  // The key must live under THIS note's prefix (no cross-note / prefix escape).
  if (!input.key.startsWith(`${CHAT_PREFIX}${noteId}/`) || input.key.includes("..")) {
    return { success: false, error: "Invalid upload" };
  }
  // Confirm the object actually landed and re-validate its real size/type.
  const head = await headPrivateObject(input.key);
  if (!head) return { success: false, error: "Upload didn't complete" };
  const v = validateChatMedia(input.kind, head.contentType || input.mime, head.size);
  if (!v.ok) {
    await deletePrivateObject(input.key);
    return { success: false, error: v.error };
  }

  const { error } = await svc.from("note_chat_messages").insert({
    note_id: noteId,
    author_id: uid,
    kind: input.kind,
    media_key: input.key,
    media_mime: baseMime(head.contentType || input.mime),
    media_meta: input.meta ?? null,
  } as any);
  if (error) {
    await deletePrivateObject(input.key);
    return { success: false, error: "Couldn't send the attachment" };
  }
  void notifyChatMessage(noteId, uid);
  return { success: true };
}

/**
 * A short-lived presigned URL to view a message's media, only for participants
 * of the note. Returns the TTL so the client can refresh before it expires.
 */
export async function getChatMediaUrl(
  messageId: string,
): Promise<{ ok: boolean; url?: string; expiresInSeconds?: number }> {
  const uid = await sessionUserId();
  if (!uid) return { ok: false };
  const svc = createServiceRoleClient();
  const { data: msg } = await svc
    .from("note_chat_messages")
    .select("note_id, media_key, deleted_at")
    .eq("id", messageId)
    .maybeSingle();
  const m = msg as any;
  if (!m || !m.media_key || m.deleted_at) return { ok: false };
  if (!(await isParticipant(svc, m.note_id, uid))) return { ok: false };
  try {
    const url = await presignGet(m.media_key);
    return { ok: true, url, expiresInSeconds: PRESIGN_TTL_SECONDS };
  } catch {
    return { ok: false };
  }
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
 * Any attached media is purged from the private bucket.
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

  // A deleted message must leave no recoverable content: purge the edit history
  // and any attached media object from the private bucket.
  await svc.from("note_chat_message_versions").delete().eq("message_id", messageId);
  if (m.media_key) await deletePrivateObject(m.media_key);
  return { success: true };
}

/**
 * Whether to surface chat for a note: the caller participates AND the note has
 * actually been shared with someone. (A collaborator viewing a share always
 * qualifies; this gates the owner's own editor so chat only shows once shared.)
 */
export async function noteChatAvailable(noteId: string): Promise<boolean> {
  const uid = await sessionUserId();
  if (!uid) return false;
  const svc = createServiceRoleClient();
  if (!(await isParticipant(svc, noteId, uid))) return false;
  const { data } = await svc.from("shared_notes").select("id").eq("note_id", noteId).limit(1);
  return !!(data && (data as any[]).length > 0);
}

/** Unread message count for the current user on a note (others' non-deleted
 *  messages since their last read). Drives the Chat button badge. */
export async function getChatUnread(noteId: string): Promise<number> {
  const uid = await sessionUserId();
  if (!uid) return 0;
  const svc = createServiceRoleClient();
  if (!(await isParticipant(svc, noteId, uid))) return 0;

  const { data: read } = await svc
    .from("note_chat_reads")
    .select("last_read_at")
    .eq("note_id", noteId)
    .eq("user_id", uid)
    .maybeSingle();
  const lastRead = (read as any)?.last_read_at as string | undefined;

  let q = svc
    .from("note_chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("note_id", noteId)
    .is("deleted_at", null)
    .neq("author_id", uid);
  if (lastRead) q = q.gt("created_at", lastRead);
  const { count } = await q;
  return count ?? 0;
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
  void markChatNotificationsRead(user.id, noteId);
  return { success: !error };
}
