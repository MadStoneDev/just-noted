// In-app notification type registry + pure render/preference helpers.

export type NotificationType = "shared_with_me" | "edited_shared_note" | "chat_message" | "mention";

// Per-channel delivery frequency. "instantly" = deliver now; "daily"/"weekly"
// batch (email digests, built later); "off" = never. In-app treats any non-"off"
// value as deliver-now until digests exist; email is not sent yet (in-app first).
export type Frequency = "instantly" | "daily" | "weekly" | "off";
export const FREQUENCIES: Frequency[] = ["instantly", "daily", "weekly", "off"];

export interface ChannelPref { inApp: Frequency; email: Frequency; }

export interface NotificationTypeDef {
  label: string;
  description: string;
  default: ChannelPref;
}

export const NOTIFICATION_TYPES: Record<NotificationType, NotificationTypeDef> = {
  shared_with_me: {
    label: "Notes shared with me",
    description: "When someone shares a note with you.",
    default: { inApp: "instantly", email: "off" },
  },
  edited_shared_note: {
    label: "Edits to shared notes",
    description: "When a note shared with you is edited by someone else.",
    default: { inApp: "off", email: "off" },
  },
  chat_message: {
    label: "New chat messages",
    description: "When someone messages in a note shared with you.",
    default: { inApp: "off", email: "off" },
  },
  mention: {
    label: "Mentions",
    description: "When someone @mentions you in a note's chat.",
    default: { inApp: "instantly", email: "off" },
  },
};

export const NOTIFICATION_TYPE_KEYS = Object.keys(NOTIFICATION_TYPES) as NotificationType[];

type PrefsMap = Record<string, Partial<ChannelPref>> | null | undefined;

function freq(v: unknown, fallback: Frequency): Frequency {
  return FREQUENCIES.includes(v as Frequency) ? (v as Frequency) : fallback;
}

/** The effective per-channel frequencies for a type (stored over registry default). */
export function prefForType(prefs: PrefsMap, type: NotificationType): ChannelPref {
  const def = NOTIFICATION_TYPES[type]?.default ?? { inApp: "off", email: "off" };
  const stored = prefs?.[type] ?? {};
  return { inApp: freq(stored.inApp, def.inApp), email: freq(stored.email, def.email) };
}

/** Should an in-app notification be created for this type? */
export function inAppEnabled(prefs: PrefsMap, type: NotificationType): boolean {
  return NOTIFICATION_TYPES[type] ? prefForType(prefs, type).inApp !== "off" : false;
}

/** Should an email be sent NOW for this type? Only "instantly" sends immediately;
 *  "daily"/"weekly" are for digests (not built yet), so they don't send now. */
export function emailInstant(prefs: PrefsMap, type: NotificationType): boolean {
  return NOTIFICATION_TYPES[type] ? prefForType(prefs, type).email === "instantly" : false;
}

/** Keep only known types + valid frequencies — for validating user-written prefs. */
export function sanitizeNotificationPrefs(input: unknown): Record<string, ChannelPref> {
  const out: Record<string, ChannelPref> = {};
  if (!input || typeof input !== "object") return out;
  for (const type of NOTIFICATION_TYPE_KEYS) {
    const v = (input as any)[type];
    if (v && typeof v === "object") {
      out[type] = prefForType({ [type]: v }, type);
    }
  }
  return out;
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
    case "mention":
      title = "You were mentioned";
      body = `${actor} mentioned you in “${noteTitle}”.`;
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
