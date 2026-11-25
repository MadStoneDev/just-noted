// Notes this device deleted whose delete the server hasn't confirmed yet.
//
// A delete hides the note at once and is sent to the server straight away (or
// queued when that fails). Until the server confirms it, anything that rebuilds
// the note list from server data — a refresh, the startup load, a realtime
// event, another tab's refresh — would still see the note as live and put it
// back ("ghost notes"). Every such path consults this set and keeps the note
// hidden instead. Nothing may write to a note in this set either (saves,
// queued edits, background pushes), so no stale save can land on it.
//
// The set lives in memory for synchronous checks and in its own IndexedDB
// database, so a reload during the window still hides the note and the next
// load finishes the delete. An entry is cleared when a fetched server list no
// longer has the note live (not merely when the delete call answers: a list
// read before the delete landed may still be on its way in), or when the user
// undoes the delete.

import type { CombinedNote, NoteSource } from "@/types/combined-notes";

export interface PendingDelete {
  id: string;
  source: NoteSource;
  /** Cloud notes: the account that deleted it (null for guest notes). */
  account: string | null;
  /** When it was deleted (ms). */
  at: number;
}

const DB_NAME = "PendingDeletesDB";
const DB_VERSION = 1;
const STORE = "deletes";

// Entries known here: read from IndexedDB, plus this tab's marks whose write
// may still be in flight. `cleared` are this tab's clears whose IndexedDB
// delete may still be in flight (a reload of the set must not bring them back).
const entries = new Map<string, PendingDelete>();
const marking = new Set<string>();
const cleared = new Set<string>();
// Deletes another tab of this browser announced (BroadcastChannel). Hidden at
// once; that tab's IndexedDB write is the durable record. Kept until the next
// "notes changed" message (an undo there) or HINT_TTL, whichever comes first.
const hints = new Map<string, number>();
const HINT_TTL = 30_000;
/** A delete call younger than this may still be in flight: don't resend it. */
export const RESEND_GRACE_MS = 15_000;

type Listener = () => void;
const listeners = new Set<Listener>();
const notify = () => listeners.forEach((l) => l());

/** Called whenever the set changes (e.g. to re-render a list). */
export function subscribePendingDeletes(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

let dbPromise: Promise<IDBDatabase> | null = null;
function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return getDB().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const r = run(t.objectStore(STORE));
        t.oncomplete = () => resolve(r ? (r.result as T) : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

function liveHint(id: string): boolean {
  const at = hints.get(id);
  if (at === undefined) return false;
  if (Date.now() - at > HINT_TTL) {
    hints.delete(id);
    return false;
  }
  return true;
}

/** Is this note deleted here and not yet confirmed by the server? */
export function isPendingDelete(id: string): boolean {
  return entries.has(id) || liveHint(id);
}

/** Every pending id (entries and live hints). */
export function pendingDeleteIds(): Set<string> {
  const ids = new Set(entries.keys());
  for (const id of hints.keys()) if (liveHint(id)) ids.add(id);
  return ids;
}

/** This tab's durable entries (hints excluded). */
export function pendingDeletes(): PendingDelete[] {
  return [...entries.values()];
}

/** Record a delete made here. Synchronous for the in-memory set; the returned
 *  promise settles once it is durable in IndexedDB. */
export function markPendingDelete(entry: PendingDelete): Promise<void> {
  entries.set(entry.id, entry);
  cleared.delete(entry.id);
  marking.add(entry.id);
  notify();
  return tx("readwrite", (s) => void s.put(entry))
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => marking.delete(entry.id));
}

/** The server confirmed the delete, or the user undid it. */
export function clearPendingDelete(id: string): Promise<void> {
  const had = entries.delete(id) || hints.delete(id);
  marking.delete(id);
  cleared.add(id);
  if (had) notify();
  return tx("readwrite", (s) => void s.delete(id))
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => cleared.delete(id));
}

/** Another tab of this browser deleted this note. */
export function notePendingDeleteFromOtherTab(id: string): void {
  hints.set(id, Date.now());
  notify();
}

/** Another tab changed the list (an undo, a restore): its record, in IndexedDB,
 *  is the truth now — drop the hints and re-read. */
export function dropPendingDeleteHints(): void {
  if (hints.size === 0) return;
  hints.clear();
  notify();
}

/**
 * Re-read the durable set (another tab may have added or cleared entries).
 * This tab's marks and clears still in flight win over what IndexedDB says.
 */
export async function loadPendingDeletes(): Promise<void> {
  let stored: PendingDelete[] = [];
  try {
    stored = ((await tx<PendingDelete[]>("readonly", (s) => s.getAll())) ?? []) as PendingDelete[];
  } catch {
    return; // no IndexedDB: the in-memory set is all we have
  }
  const next = new Map<string, PendingDelete>();
  for (const e of stored) if (e?.id && !cleared.has(e.id)) next.set(e.id, e);
  for (const id of marking) {
    const e = entries.get(id);
    if (e) next.set(id, e);
  }
  const changed =
    next.size !== entries.size || [...next.keys()].some((id) => !entries.has(id));
  entries.clear();
  for (const [id, e] of next) entries.set(id, e);
  if (changed) notify();
}

// ── pure helpers (unit-tested) ───────────────────────────────────────────────

/**
 * A note list as it should be shown: notes with a pending delete stay hidden
 * (kept as tombstones, like the optimistic delete), whatever the server said.
 */
export function hidePendingDeletes(
  notes: CombinedNote[],
  pending: ReadonlySet<string> = pendingDeleteIds(),
  now: number = Date.now(),
): CombinedNote[] {
  if (pending.size === 0) return notes;
  let changed = false;
  const out = notes.map((n) => {
    if (!pending.has(n.id) || n.deletedAt) return n;
    changed = true;
    return { ...n, deletedAt: now };
  });
  return changed ? out : notes;
}

/**
 * Compare this device's pending deletes with a fresh server list.
 * - `confirmed`: the server no longer has the note live → clear the entry.
 * - `resend`: the server still has it live, older than `graceMs` (so not just a
 *   call still in flight), e.g. the page reloaded before the call landed →
 *   send it again (the queue collapses repeats; a repeat delete is a no-op).
 * Only sources whose fetch succeeded are judged, and a cloud entry only by the
 * account that made it (another account's list can't see its notes).
 */
export function settlePendingDeletes(
  pending: PendingDelete[],
  serverNotes: CombinedNote[],
  fetched: { redis: boolean; supabase: boolean },
  activeAccount: string | null,
  now: number = Date.now(),
  graceMs: number = RESEND_GRACE_MS,
): { confirmed: string[]; resend: PendingDelete[] } {
  const live = new Set(serverNotes.filter((n) => !n.deletedAt).map((n) => n.id));
  const confirmed: string[] = [];
  const resend: PendingDelete[] = [];
  for (const e of pending) {
    if (e.source === "redis" ? !fetched.redis : !fetched.supabase) continue;
    if (e.source === "supabase" && e.account !== activeAccount) continue;
    if (live.has(e.id)) {
      if (now - e.at >= graceMs) resend.push(e);
    }
    else confirmed.push(e.id);
  }
  return { confirmed, resend };
}

/** Test hook: forget everything in memory. */
export function __resetPendingDeletesForTests(): void {
  entries.clear();
  marking.clear();
  cleared.clear();
  hints.clear();
  dbPromise = null;
}
