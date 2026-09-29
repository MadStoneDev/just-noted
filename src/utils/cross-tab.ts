// Cross-tab/device coordination for note saves (Phase 3, point 8).
//
// - Web Locks serialize saves to the SAME note within one browser, so two tabs
//   don't both read-modify-write and spawn redundant conflicts (belt-and-braces
//   with the server-side atomic CAS).
// - BroadcastChannel propagates a completed save to other tabs so they refresh
//   their in-memory copy instead of later re-saving stale content.

const CHANNEL_NAME = "justnoted-note-updates";
let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!channel) {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
    } catch {
      channel = null;
    }
  }
  return channel;
}

export interface NoteUpdateMessage {
  noteId: string;
  version?: number;
  content?: string;
  contentFormat?: string;
  origin: string; // a per-tab id so a tab ignores its own echoes
}

// A stable per-tab id so we never react to our own broadcast.
export const TAB_ID =
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function broadcastNoteUpdate(msg: Omit<NoteUpdateMessage, "origin">): void {
  try {
    getChannel()?.postMessage({ ...msg, origin: TAB_ID });
  } catch {
    /* channel closed / unsupported */
  }
}

export function subscribeNoteUpdates(cb: (msg: NoteUpdateMessage) => void): () => void {
  const ch = getChannel();
  if (!ch) return () => {};
  const handler = (e: MessageEvent) => {
    const data = e.data as NoteUpdateMessage;
    if (!data || data.origin === TAB_ID) return; // ignore our own echoes
    try {
      cb(data);
    } catch {
      /* ignore */
    }
  };
  ch.addEventListener("message", handler);
  return () => ch.removeEventListener("message", handler);
}

/** Run `fn` while holding a per-note Web Lock (serializes same-note saves across
 *  tabs). Falls back to running directly where Web Locks aren't available. */
export async function withNoteLock<T>(noteId: string, fn: () => Promise<T>): Promise<T> {
  const nav = typeof navigator !== "undefined" ? (navigator as any) : undefined;
  if (nav?.locks?.request) {
    return await nav.locks.request(`jn-note-save:${noteId}`, async () => fn());
  }
  return fn();
}
