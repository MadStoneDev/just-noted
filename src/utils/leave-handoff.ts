// Hand a closing tab's unsaved text to the other tabs of this browser.
//
// A tab that closes inside the editor's debounce has one synchronous turn
// (pagehide) to save the last words. Its network save may never leave the
// browser and its IndexedDB writes may not commit (see the ticket
// docs/tickets/flaky-pagehide-second-tab-e2e.md). A BroadcastChannel message
// is delivered to the other open tabs even when the sender dies right after
// posting it, so a surviving tab can make the text durable itself and, if its
// editor takes the note over, adopt it before the user can type.
//
// The receiving side (use-notes-sync, active-note-editor) decides what to do;
// this module only carries the message and remembers the latest one per note.

import { TAB_ID } from "./cross-tab";

export const LEAVE_CHANNEL_NAME = "justnoted-leave";

export interface LeaveHandoff {
  noteId: string;
  source: "redis" | "supabase";
  /** The queue tag: the guest device id (redis) or the account id (supabase). */
  userId: string;
  content: string;
  goal: number;
  goalType: "" | "words" | "characters";
  /** The version the text was edited from (CAS base). */
  baseVersion?: number;
  /** Same copy id as the closing tab's queue entry and keepalive save. */
  copyId: string;
  /** The closing editor's Yjs doc state, for a collaborative note (see the queue's QueuedUpdateOp). */
  collabState?: string;
  /** TAB_ID of the closing tab. */
  from: string;
}

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!channel) {
    try {
      channel = new BroadcastChannel(LEAVE_CHANNEL_NAME);
      channel.onmessage = (e) => receive(e.data);
    } catch {
      channel = null;
    }
  }
  return channel;
}

/** Open the channel now (at app start) so the close path only has to post. */
export function warmLeaveChannel(): void {
  getChannel();
}

/** Closing tab: post the unsaved text. Synchronous; never throws. */
export function announceLeave(h: Omit<LeaveHandoff, "from">): void {
  try {
    getChannel()?.postMessage({ ...h, from: TAB_ID } satisfies LeaveHandoff);
  } catch {
    /* channel closed / unsupported / not cloneable */
  }
}

// ── Receiving side ─────────────────────────────────────────────────────────

const latest = new Map<string, LeaveHandoff>();
type Listener = (h: LeaveHandoff) => void;
const noteListeners = new Map<string, Set<Listener>>();
const anyListeners = new Set<Listener>();

export function isLeaveHandoff(v: unknown): v is LeaveHandoff {
  if (!v || typeof v !== "object") return false;
  const h = v as Record<string, unknown>;
  return (
    typeof h.noteId === "string" &&
    !!h.noteId &&
    (h.source === "redis" || h.source === "supabase") &&
    typeof h.userId === "string" &&
    typeof h.content === "string" &&
    typeof h.goal === "number" &&
    (h.goalType === "" || h.goalType === "words" || h.goalType === "characters") &&
    (h.baseVersion === undefined || Number.isInteger(h.baseVersion)) &&
    typeof h.copyId === "string" &&
    !!h.copyId &&
    (h.collabState === undefined || typeof h.collabState === "string") &&
    typeof h.from === "string"
  );
}

function receive(data: unknown): void {
  if (!isLeaveHandoff(data) || data.from === TAB_ID) return;
  latest.set(data.noteId, data);
  // Every-tab handling first (it makes the text durable here), then the
  // note's editor, if this tab has one.
  anyListeners.forEach((cb) => cb(data));
  noteListeners.get(data.noteId)?.forEach((cb) => cb(data));
}

/** The newest handoff received for a note and not yet settled. */
export function peekHandoff(noteId: string): LeaveHandoff | undefined {
  return latest.get(noteId);
}

/** Settled (adopted, sent, or superseded): forget it, if it's still the newest. */
export function settleHandoff(noteId: string, copyId: string): void {
  if (latest.get(noteId)?.copyId === copyId) latest.delete(noteId);
}

/** Every handoff this tab receives (the app-wide receiver). */
export function subscribeLeaveHandoffs(cb: Listener): () => void {
  getChannel();
  anyListeners.add(cb);
  return () => anyListeners.delete(cb);
}

/** Handoffs for one note (its open editor). */
export function subscribeNoteHandoffs(noteId: string, cb: Listener): () => void {
  getChannel();
  let set = noteListeners.get(noteId);
  if (!set) noteListeners.set(noteId, (set = new Set()));
  set.add(cb);
  return () => {
    set!.delete(cb);
    if (!set!.size) noteListeners.delete(noteId);
  };
}

/** Whether an editor in this tab listens for this note's handoffs. */
export function hasNoteHandoffListener(noteId: string): boolean {
  return (noteListeners.get(noteId)?.size ?? 0) > 0;
}

/** Test hook: deliver a message as if another tab had posted it. */
export function __receiveForTest(data: unknown): void {
  receive(data);
}

/** Test hook: forget all state. */
export function __resetLeaveHandoffForTest(): void {
  latest.clear();
  noteListeners.clear();
  anyListeners.clear();
}
