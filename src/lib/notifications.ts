// In-app notification type registry + pure render/preference helpers.

export type NotificationType = "shared_with_me" | "edited_shared_note" | "chat_message";

export interface NotificationTypeDef {
  defaultOn: boolean;
  label: string; // for the Settings toggle
  description: string;
}

export const NOTIFICATION_TYPES: Record<NotificationType, NotificationTypeDef> = {
  shared_with_me: {
    defaultOn: true,
    label: "Notes shared with me",
    description: "When someone shares a note with you.",
  },
  edited_shared_note: {
    defaultOn: false,
    label: "Edits to shared notes",
    description: "When a note shared with you is edited by someone else.",
  },
  chat_message: {
    defaultOn: true,
    label: "New chat messages",
    description: "When someone messages in a note shared with you.",
  },
};

export const NOTIFICATION_TYPE_KEYS = Object.keys(NOTIFICATION_TYPES) as NotificationType[];

/** Is a type enabled for a user? Their stored pref overrides the default. */
export function prefEnabled(
  prefs: Record<string, boolean> | null | undefined,
  type: NotificationType,
): boolean {
  const def = NOTIFICATION_TYPES[type];
  if (!def) return false;
  const v = prefs?.[type];
  return typeof v === "boolean" ? v : def.defaultOn;
}

export interface NotificationRow {
  id: string;
  type: string;
  actor_id: string | null;
  note_id: string | null;
  data: any;
  read_at: string | null;
  created_at: string;
}

export interface NotificationView {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  isRead: boolean;
  createdAt: string;
  noteId: string | null;
}

/** Map a row to display fields. `data` carries actorName / noteTitle / shortcode. */
export function renderNotification(row: NotificationRow): NotificationView {
  const actor = (row.data?.actorName as string) || "Someone";
  const noteTitle = (row.data?.noteTitle as string) || "a note";
  const shortcode = row.data?.shortcode as string | undefined;
  const href = shortcode ? `/n/${shortcode}` : null;

  let title = "Notification";
  let body = "";
  switch (row.type) {
    case "shared_with_me":
      title = "Note shared with you";
      body = `${actor} shared “${noteTitle}” with you.`;
      break;
    case "edited_shared_note":
      title = "Shared note edited";
      body = `${actor} edited “${noteTitle}”.`;
      break;
    case "chat_message":
      title = "New message";
      body = `${actor} messaged in “${noteTitle}”.`;
      break;
  }
  return {
    id: row.id,
    type: row.type,
    title,
    body,
    href,
    isRead: !!row.read_at,
    createdAt: row.created_at,
    noteId: row.note_id,
  };
}
