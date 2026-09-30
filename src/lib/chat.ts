// Collaboration chat — shared types + a pure row→view mapper so the display
// rules (deleted tombstone, edited flag, "Deleted user", own-message) live in
// one testable place.

export type ChatKind = "text" | "image" | "gif" | "audio" | "system";

export interface ChatMessageRow {
  id: string;
  note_id: string;
  author_id: string | null;
  kind: string;
  body: string | null;
  reply_to: string | null;
  anchor: unknown | null;
  media_key: string | null;
  media_mime: string | null;
  media_meta: unknown | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
}

export interface ChatAuthor {
  id: string;
  username: string;
  avatarUrl: string | null;
}

export interface MessageAnchor {
  relStart: string;
  relEnd: string;
  quote: string;
}

export interface ChatMessageView {
  id: string;
  kind: ChatKind;
  body: string | null;
  authorId: string | null;
  authorName: string; // "Deleted user" when the author can't be resolved
  authorAvatar: string | null;
  isOwn: boolean;
  isDeleted: boolean;
  isEdited: boolean;
  replyTo: string | null;
  createdAt: string;
  hasMedia: boolean;
  anchor: MessageAnchor | null;
}

function readAnchor(raw: unknown): MessageAnchor | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  if (typeof a.relStart === "string" && typeof a.relEnd === "string" && typeof a.quote === "string") {
    return { relStart: a.relStart, relEnd: a.relEnd, quote: a.quote };
  }
  return null;
}

/**
 * Map a raw message row to its display view. A soft-deleted row becomes a
 * "Message deleted" tombstone (no body/media) but keeps its author and time; an
 * author who no longer resolves (deleted account) shows as "Deleted user".
 */
export function toMessageView(
  row: ChatMessageRow,
  viewerId: string | null,
  authors: Map<string, ChatAuthor>,
): ChatMessageView {
  const isDeleted = !!row.deleted_at;
  const author = row.author_id ? authors.get(row.author_id) : undefined;
  return {
    id: row.id,
    kind: isDeleted ? "text" : (row.kind as ChatKind),
    body: isDeleted ? null : row.body,
    authorId: row.author_id,
    authorName: author?.username ?? "Deleted user",
    authorAvatar: isDeleted ? null : author?.avatarUrl ?? null,
    isOwn: !!viewerId && row.author_id === viewerId,
    isDeleted,
    isEdited: !isDeleted && !!row.edited_at,
    replyTo: row.reply_to,
    createdAt: row.created_at,
    hasMedia: !isDeleted && !!row.media_key,
    anchor: isDeleted ? null : readAnchor(row.anchor),
  };
}
