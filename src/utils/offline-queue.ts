// src/utils/offline-queue.ts
// Standalone IDB-backed offline operation queue with dedup, collapse, and retry.

import { noteOperation } from "@/app/actions/notes";
import {
  updateNotePinStatus as updateSupabaseNotePinStatus,
  updateNotePrivacyStatus as updateSupabaseNotePrivacyStatus,
  updateNoteCollapsedStatus as updateSupabaseNoteCollapsedStatus,
  deleteNote as deleteSupabaseNote,
  updateNote as updateSupabaseNote,
  updateNoteTitle as updateSupabaseNoteTitle,
  createNote as createSupabaseNote,
  getCloudNoteOwners,
} from "@/app/actions/supabaseActions";
import type { RedisNote, CombinedNote } from "@/types/combined-notes";
import {
  shouldSyncOp,
  getActiveSupabaseUser,
  cloudAccountFor,
  needsCloudAccountTag,
  legacyOpOwner,
  removedAccountIds,
  deviceUserId,
} from "./offline-queue-guard";
import { cachedCloudOwners, clearAccountNotes } from "./notes-idb-cache";
import { sameNoteContent } from "./notes-utils";
import { conflictStamp } from "./background-conflict";
import { TAB_ID } from "./cross-tab";
import { notesNotToWrite } from "./note-ownership";
import { v4 as uuidv4 } from "uuid";
import {
  OFFLINE_QUEUE_DB_NAME,
  OFFLINE_QUEUE_DB_VERSION,
  OFFLINE_QUEUE_STORE_NAME,
  QUEUE_BACKOFF_BASE_MS,
  QUEUE_BACKOFF_MAX_MS,
  QUEUE_PROBLEM_RETRIES,
} from "@/constants/app";

// ===========================
// TYPES
// ===========================

type QueuedOperationType =
  | "create"
  | "update"
  | "updateTitle"
  | "updatePin"
  | "updatePrivacy"
  | "updateCollapsed"
  | "delete";

interface QueuedCreateOp {
  type: "create";
  noteId: string;
  source: "redis" | "supabase";
  userId: string;
  note: RedisNote | CombinedNote;
}

interface QueuedUpdateOp {
  type: "update";
  noteId: string;
  source: "redis" | "supabase";
  userId: string;
  content: string;
  goal: number;
  goalType: "" | "words" | "characters";
  /**
   * The server version this text was edited from. Replays CAS on it as a
   * background write: if the server moved past it, the server note is kept and
   * this text becomes a "(conflicted copy)" (see background-conflict.ts).
   * Absent only on entries queued by an older build: those CAS on the time
   * they were queued instead (server changed since → conflicted copy).
   */
  baseVersion?: number;
  /** Fixed id for that conflicted copy, so retries (and the tab-close keepalive
   * save of the same edit) make at most one. Assigned at enqueue. */
  copyId?: string;
}

interface QueuedUpdateTitleOp {
  type: "updateTitle";
  noteId: string;
  source: "redis" | "supabase";
  userId: string;
  title: string;
}

interface QueuedUpdatePinOp {
  type: "updatePin";
  noteId: string;
  source: "redis" | "supabase";
  userId: string;
  isPinned: boolean;
}

interface QueuedUpdatePrivacyOp {
  type: "updatePrivacy";
  noteId: string;
  source: "redis" | "supabase";
  userId: string;
  isPrivate: boolean;
}

interface QueuedUpdateCollapsedOp {
  type: "updateCollapsed";
  noteId: string;
  source: "redis" | "supabase";
  userId: string;
  isCollapsed: boolean;
}

interface QueuedDeleteOp {
  type: "delete";
  noteId: string;
  source: "redis" | "supabase";
  userId: string;
}

export type QueuedOperationPayload =
  | QueuedCreateOp
  | QueuedUpdateOp
  | QueuedUpdateTitleOp
  | QueuedUpdatePinOp
  | QueuedUpdatePrivacyOp
  | QueuedUpdateCollapsedOp
  | QueuedDeleteOp;

interface QueuedOperation {
  id: string;
  payload: QueuedOperationPayload;
  timestamp: number;
  retryCount: number;
  lastAttempt: number | null;
  /** TAB_ID of the tab that queued it (absent on entries from older builds). */
  origin?: string;
}

// ===========================
// PUB/SUB
// ===========================

type Listener = (count: number) => void;
const listeners = new Set<Listener>();

function notifySubscribers(count: number) {
  listeners.forEach((cb) => cb(count));
}

export function subscribe(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// Drop notification channel — fires when an op is permanently discarded
type DropListener = (payload: QueuedOperationPayload) => void;
const dropListeners = new Set<DropListener>();

function notifyDropListeners(payload: QueuedOperationPayload) {
  dropListeners.forEach((cb) => cb(payload));
}

export function subscribeDrops(cb: DropListener): () => void {
  dropListeners.add(cb);
  return () => {
    dropListeners.delete(cb);
  };
}

// Background-conflict channel — a replayed edit met a newer server version, so
// the server note was kept and the edit was saved as a "(conflicted copy)".
// Nothing was lost; listeners refresh so the copy shows up.
type ConflictListener = (payload: QueuedUpdateOp) => void;
const conflictListeners = new Set<ConflictListener>();

export function subscribeConflicts(cb: ConflictListener): () => void {
  conflictListeners.add(cb);
  return () => {
    conflictListeners.delete(cb);
  };
}

// Sync-problem channel — true while one or more queued ops keep failing. Unlike
// drops, this never means data was lost: the ops are retained and retried.
type ProblemListener = (hasProblem: boolean) => void;
const problemListeners = new Set<ProblemListener>();
let syncProblem = false;

function setSyncProblem(next: boolean) {
  if (next === syncProblem) return;
  syncProblem = next;
  problemListeners.forEach((cb) => cb(next));
}

export function getSyncProblem(): boolean {
  return syncProblem;
}

export function subscribeProblem(cb: ProblemListener): () => void {
  problemListeners.add(cb);
  cb(syncProblem); // emit current state on subscribe
  return () => {
    problemListeners.delete(cb);
  };
}

// Exponential backoff for a queued op based on how many times it has failed.
function backoffMs(retryCount: number): number {
  if (retryCount <= 0) return 0;
  return Math.min(QUEUE_BACKOFF_BASE_MS * 2 ** (retryCount - 1), QUEUE_BACKOFF_MAX_MS);
}

// ===========================
// IDB HELPERS
// ===========================

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_QUEUE_DB_NAME, OFFLINE_QUEUE_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OFFLINE_QUEUE_STORE_NAME)) {
        const store = db.createObjectStore(OFFLINE_QUEUE_STORE_NAME, { keyPath: "id" });
        store.createIndex("noteId", "payload.noteId", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllOps(): Promise<QueuedOperation[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_QUEUE_STORE_NAME, "readonly");
    const store = tx.objectStore(OFFLINE_QUEUE_STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function putOp(op: QueuedOperation): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_QUEUE_STORE_NAME, "readwrite");
    const store = tx.objectStore(OFFLINE_QUEUE_STORE_NAME);
    store.put(op);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function deleteOp(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_QUEUE_STORE_NAME, "readwrite");
    const store = tx.objectStore(OFFLINE_QUEUE_STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function deleteOpsByNoteId(noteId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_QUEUE_STORE_NAME, "readwrite");
    const store = tx.objectStore(OFFLINE_QUEUE_STORE_NAME);
    const index = store.index("noteId");
    const req = index.openCursor(IDBKeyRange.only(noteId));

    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function clearAllOps(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_QUEUE_STORE_NAME, "readwrite");
    const store = tx.objectStore(OFFLINE_QUEUE_STORE_NAME);
    store.clear();
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function countOps(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_QUEUE_STORE_NAME, "readonly");
    const store = tx.objectStore(OFFLINE_QUEUE_STORE_NAME);
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function getOpsByNoteId(noteId: string): Promise<QueuedOperation[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_QUEUE_STORE_NAME, "readonly");
    const store = tx.objectStore(OFFLINE_QUEUE_STORE_NAME);
    const index = store.index("noteId");
    const req = index.getAll(IDBKeyRange.only(noteId));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

// ===========================
// ENQUEUE (with dedup + collapse)
// ===========================

/**
 * A newer queued edit replaces an older one for the same note only when both
 * were made from the same server version (or the older one predates versioned
 * entries). An older entry on a different base is kept: it replays first and,
 * if the server has moved on, becomes a conflicted copy instead of vanishing.
 */
function replacesUpdate(older: QueuedUpdateOp, newer: QueuedUpdateOp): boolean {
  return older.baseVersion === undefined || older.baseVersion === newer.baseVersion;
}

// Strictly increasing within this tab: ops replay (and collapse) in timestamp
// order, and a note can hold more than one update, so two ops queued in the
// same millisecond must not tie.
let lastStamp = 0;
function nextTimestamp(): number {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return lastStamp;
}

/**
 * A point on the queue's clock. A save marks its start with this (not
 * Date.now()) so "queued before / after the save started" in
 * dropSupersededUpdates is decided on the same strictly-ordered clock.
 */
export function queueClock(): number {
  return nextTimestamp();
}

function withCopyId<T extends QueuedOperationPayload>(payload: T): T {
  if (payload.type === "update" && !payload.copyId) {
    return { ...payload, copyId: uuidv4() };
  }
  return payload;
}

/**
 * A cloud op is tagged with the ACCOUNT it belongs to (the Supabase user id),
 * not the device id callers pass as `userId`: that tag is what keeps it parked
 * for its account across a sign-out or an account switch (offline-queue-guard).
 * Local (Redis) ops keep the device id, which the server action needs.
 */
function withAccount<T extends QueuedOperationPayload>(payload: T): T {
  if (payload.source !== "supabase") return payload;
  const userId = cloudAccountFor(payload.userId);
  return userId === payload.userId ? payload : { ...payload, userId };
}

export async function enqueue(input: QueuedOperationPayload): Promise<void> {
  const payload = withAccount(withCopyId(input));
  const noteId = payload.noteId;

  // Rule 2: Delete wins — remove all other ops for this noteId
  if (payload.type === "delete") {
    await deleteOpsByNoteId(noteId);
  } else {
    // Rule 3: If there's a queued create for the same noteId and we're doing an update,
    // merge update data into the create op
    const existing = await getOpsByNoteId(noteId);

    const createOp = existing.find((op) => op.payload.type === "create");
    if (createOp && payload.type === "update") {
      // Merge content/goal into the create op's note payload
      const createPayload = createOp.payload as QueuedCreateOp;
      const note = createPayload.note as unknown as Record<string, unknown>;
      note.content = payload.content;
      note.goal = payload.goal;
      note.goal_type = payload.goalType;
      await putOp(createOp);

      const count = await countOps();
      notifySubscribers(count);
      return;
    }

    if (createOp && payload.type === "updateTitle") {
      const createPayload = createOp.payload as QueuedCreateOp;
      const note = createPayload.note as unknown as Record<string, unknown>;
      note.title = payload.title;
      await putOp(createOp);

      const count = await countOps();
      notifySubscribers(count);
      return;
    }

    // Rule 1: Same noteId + same type → replace older (content updates: only
    // one made from the same base — see replacesUpdate)
    for (const op of existing) {
      if (op.payload.type !== payload.type) continue;
      if (
        payload.type === "update" &&
        !replacesUpdate(op.payload as QueuedUpdateOp, payload)
      ) {
        continue;
      }
      await deleteOp(op.id);
      if (payload.type !== "update") break;
    }
  }

  // Add new op
  const timestamp = nextTimestamp();
  const op: QueuedOperation = {
    id: `op_${timestamp}_${Math.random().toString(36).slice(2, 11)}`,
    payload,
    timestamp,
    retryCount: 0,
    lastAttempt: null,
    origin: TAB_ID,
  };

  await putOp(op);

  const count = await countOps();
  notifySubscribers(count);
}

// ===========================
// PROCESS QUEUE
// ===========================

let processing = false;
let currentPass: Promise<void> | null = null;

function throwIfFailed(result: { success: boolean; error?: string }, fallback: string): void {
  if (!result.success) {
    throw new Error(result.error || fallback);
  }
}

async function executeOp(payload: QueuedOperationPayload, queuedAt: number): Promise<void> {
  const { type, source, userId, noteId } = payload;

  switch (type) {
    case "create": {
      const { note } = payload;
      if (source === "redis") {
        throwIfFailed(await noteOperation("redis", { operation: "create", userId, note }), "Create failed");
      } else {
        throwIfFailed(await createSupabaseNote(note as CombinedNote), "Create failed");
      }
      break;
    }
    case "update": {
      const { content, goal, goalType, baseVersion } = payload;
      // Every entry replays as a background CAS write: a newer server edit is
      // never overwritten — the server note stays, this text becomes a
      // "(conflicted copy)" (identical text: nothing to do). Versioned entries
      // CAS on their base version. Entries from older builds carry no base, so
      // the time they were queued stands in: if the server note changed after
      // that, it's a copy (see decideBackgroundWrite).
      const conflictCopy = { id: payload.copyId ?? uuidv4(), stamp: conflictStamp() };
      const base =
        typeof baseVersion === "number" ? { baseVersion } : { queuedAt };
      let r: { success: boolean; error?: string; conflicted?: boolean };
      if (source === "redis") {
        r = await noteOperation("redis", {
          operation: "update", userId, noteId, content, goal, goalType, ...base, conflictCopy,
        });
      } else {
        r = await updateSupabaseNote(noteId, content, goal, goalType, { ...base, conflictCopy });
      }
      throwIfFailed(r, "Update failed");
      if (r.conflicted) {
        conflictListeners.forEach((cb) => cb(payload));
      }
      break;
    }
    case "updateTitle": {
      const { title } = payload;
      if (source === "redis") {
        throwIfFailed(await noteOperation("redis", { operation: "updateTitle", userId, noteId, title }), "UpdateTitle failed");
      } else {
        throwIfFailed(await updateSupabaseNoteTitle(noteId, title), "UpdateTitle failed");
      }
      break;
    }
    case "updatePin": {
      const { isPinned } = payload;
      if (source === "redis") {
        throwIfFailed(await noteOperation("redis", { operation: "updatePin", userId, noteId, isPinned }), "UpdatePin failed");
      } else {
        throwIfFailed(await updateSupabaseNotePinStatus(noteId, isPinned), "UpdatePin failed");
      }
      break;
    }
    case "updatePrivacy": {
      const { isPrivate } = payload;
      if (source === "redis") {
        throwIfFailed(await noteOperation("redis", { operation: "updatePrivacy", userId, noteId, isPrivate }), "UpdatePrivacy failed");
      } else {
        throwIfFailed(await updateSupabaseNotePrivacyStatus(noteId, isPrivate), "UpdatePrivacy failed");
      }
      break;
    }
    case "updateCollapsed": {
      const { isCollapsed } = payload;
      if (source === "redis") {
        throwIfFailed(await noteOperation("redis", { operation: "updateCollapsed", userId, noteId, isCollapsed }), "UpdateCollapsed failed");
      } else {
        throwIfFailed(await updateSupabaseNoteCollapsedStatus(noteId, isCollapsed), "UpdateCollapsed failed");
      }
      break;
    }
    case "delete": {
      if (source === "redis") {
        throwIfFailed(await noteOperation("redis", { operation: "delete", userId, noteId }), "Delete failed");
      } else {
        throwIfFailed(await deleteSupabaseNote(noteId), "Delete failed");
      }
      break;
    }
  }
}

let retryTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRetry(delayMs: number): void {
  if (retryTimer) return; // one pending retry is enough
  if (typeof setTimeout === "undefined") return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    processQueue().catch(() => {});
  }, Math.max(1000, delayMs));
}

/**
 * Replay one note's queued operations now, in order — used by the editor that
 * just took ownership of the note, BEFORE it starts writing, for queued text
 * that doesn't apply cleanly on the version it holds. Each update goes through
 * the same background CAS as processQueue (server decides: apply, copy or
 * no-op). Stops at the first failure; what's left replays later.
 */
export async function replayQueuedFor(noteId: string): Promise<void> {
  const ops = (await getOpsByNoteId(noteId)).sort((a, b) => a.timestamp - b.timestamp);
  for (const op of ops) {
    if (!shouldSyncOp(op.payload, getActiveSupabaseUser())) continue;
    if (op.payload.type === "update" && !op.payload.copyId) {
      op.payload = withCopyId(op.payload);
      await putOp(op);
    }
    try {
      await executeOp(op.payload, op.timestamp);
      await deleteOp(op.id);
    } catch {
      break;
    }
  }
  notifySubscribers(await countOps());
}

export interface ProcessQueueOptions {
  /**
   * Try every sendable op now, even one still waiting out its backoff, and if a
   * pass is already running, wait for it and then run one more. For a caller
   * that needs to know what is still unsent afterwards (sign-out).
   */
  now?: boolean;
}

export async function processQueue(opts: ProcessQueueOptions = {}): Promise<void> {
  while (processing) {
    if (!opts.now) return;
    await currentPass?.catch(() => {});
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  processing = true;
  const pass = runPass(opts);
  currentPass = pass;
  try {
    await pass;
  } finally {
    if (currentPass === pass) currentPass = null;
  }
}

async function runPass(opts: ProcessQueueOptions): Promise<void> {
  try {
    const ops = (await getAllOps()).sort((a, b) => a.timestamp - b.timestamp);
    const now = Date.now();
    // Per-note ordering: if a note's op fails or is waiting out its backoff,
    // skip its later ops this pass, but keep syncing OTHER notes (one stuck note
    // must not block the whole queue).
    const blocked = new Set<string>();
    let nextWakeup = Infinity;

    // One upload path per note: an open editor (any tab) owns its note's
    // uploads, and took over its queued text when it opened it. Its entries
    // replay once the note is closed again (or are superseded by its saves).
    const notToWrite = await notesNotToWrite();

    for (const op of ops) {
      const noteId = op.payload.noteId;
      if (blocked.has(noteId)) continue;
      if (op.payload.type === "update" && notToWrite.has(noteId)) continue;

      // B7: never send another account's cloud op under the current session.
      // Left in the queue untouched (no failure, no backoff) so it syncs once
      // its owning account is signed back in. See offline-queue-guard.ts.
      if (!shouldSyncOp(op.payload, getActiveSupabaseUser())) continue;

      // Respect exponential backoff for previously-failed ops.
      if (!opts.now && op.retryCount > 0 && op.lastAttempt) {
        const waitLeft = backoffMs(op.retryCount) - (now - op.lastAttempt);
        if (waitLeft > 0) {
          blocked.add(noteId);
          nextWakeup = Math.min(nextWakeup, waitLeft);
          continue;
        }
      }

      // An entry from an older build has no fixed copy id: give it one and
      // persist it first, so a retry (e.g. a lost response) can't make a
      // second conflicted copy.
      if (op.payload.type === "update" && !op.payload.copyId) {
        op.payload = withCopyId(op.payload);
        await putOp(op);
      }

      try {
        await executeOp(op.payload, op.timestamp);
        await deleteOp(op.id);
      } catch {
        // NEVER drop a queued edit. Keep it, back off, and retry later. Ops that
        // are provably obsolete (superseded by a newer op for the same note, or
        // a delete) are already removed at enqueue time (see enqueue()).
        op.retryCount += 1;
        op.lastAttempt = Date.now();
        await putOp(op);
        blocked.add(noteId);
        nextWakeup = Math.min(nextWakeup, backoffMs(op.retryCount));
      }
    }

    // Raise/clear the sync-problem flag based on the worst offender.
    const remaining = await getAllOps();
    const hasProblem = remaining.some((o) => o.retryCount >= QUEUE_PROBLEM_RETRIES);
    setSyncProblem(hasProblem);

    // If anything is still pending, keep retrying (while online) with backoff.
    if (remaining.length > 0 && Number.isFinite(nextWakeup)) {
      scheduleRetry(nextWakeup);
    }
  } finally {
    processing = false;
    const count = await countOps();
    notifySubscribers(count);
  }
}

// ===========================
// PUBLIC API
// ===========================

export async function getQueueSize(): Promise<number> {
  try {
    return await countOps();
  } catch {
    return 0;
  }
}

/**
 * Ops this session can send: local ones plus the signed-in account's cloud
 * ones. Another account's parked ops can't sync here, so they never count as
 * "still syncing" (and never hold up an account switch); the signed-out notice
 * reports them instead.
 */
export async function getSendableQueueSize(): Promise<number> {
  try {
    const active = getActiveSupabaseUser();
    return (await getAllOps()).filter((o) => shouldSyncOp(o.payload, active)).length;
  } catch {
    return 0;
  }
}

export async function clearQueue(): Promise<void> {
  await clearAllOps();
  notifySubscribers(0);
}

/** Notes with a cloud op queued for this account (and not yet sent). */
export async function queuedNoteIdsForAccount(accountId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  if (!accountId) return ids;
  try {
    for (const op of await getAllOps()) {
      if (op.payload.source === "supabase" && op.payload.userId === accountId) ids.add(op.payload.noteId);
    }
  } catch {
    /* unreadable queue: nothing we can count */
  }
  return ids;
}

/**
 * Cloud edits parked for accounts that aren't signed in right now: per account,
 * the notes with an op waiting for it to sign back in.
 */
export async function parkedNotesByAccount(): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  const active = getActiveSupabaseUser();
  try {
    for (const op of await getAllOps()) {
      const p = op.payload;
      if (p.source !== "supabase" || shouldSyncOp(p, active)) continue;
      if (!out.has(p.userId)) out.set(p.userId, new Set());
      out.get(p.userId)!.add(p.noteId);
    }
  } catch {
    /* unreadable queue */
  }
  return out;
}

/**
 * Drop this account's cloud ops, and nothing else: local (guest) ops and other
 * accounts' parked ops stay. Only for a sign-out the user chose (and confirmed,
 * if edits were unsynced). Returns how many were dropped.
 */
export async function clearAccountOps(accountId: string): Promise<number> {
  if (!accountId) return 0;
  let dropped = 0;
  for (const op of await getAllOps()) {
    if (op.payload.source === "supabase" && op.payload.userId === accountId) {
      await deleteOp(op.id);
      dropped++;
    }
  }
  notifySubscribers(await countOps());
  return dropped;
}

/**
 * Unsynced cloud notes parked for accounts that are no longer on this device
 * (removed from the account list, not signed in): per account, the notes with
 * an entry waiting. They'd replay if that account signed in here again;
 * Settings → Sync & data offers to discard them, never automatically.
 */
export async function removedAccountsParked(onDevice: Iterable<string>): Promise<Map<string, Set<string>>> {
  const parked = await parkedNotesByAccount();
  const ids = removedAccountIds(parked.keys(), onDevice, getActiveSupabaseUser(), deviceUserId());
  return new Map(ids.map((id) => [id, parked.get(id)!]));
}

/**
 * Discard what a removed account left parked: its queue entries and its cached
 * copies (untagged copies and everything else stay). Re-checks at the moment
 * of the discard, so an account added back meanwhile keeps its entries.
 * Returns how many notes' edits were dropped.
 */
export async function discardRemovedAccountsParked(onDevice: Iterable<string>): Promise<number> {
  const removed = await removedAccountsParked(onDevice);
  let notes = 0;
  for (const [accountId, ids] of removed) {
    await clearAccountOps(accountId);
    await clearAccountNotes(accountId, { includeUntagged: false });
    notes += ids.size;
  }
  return notes;
}

// B7: cloud ops queued without an account tag: blank (before ops were
// account-scoped) or carrying the device id (before cloud ops were tagged with
// the Supabase account id rather than the store's device-level userId). The
// device id is shared by every account on this device, so such an op is NOT
// simply adopted by whoever signs in next: it's tagged with the account that
// owns its note, by the server's say (the note's author, where this session can
// see it) or else the cached copy's account. Then the guard replays it for that
// account only, and parks it for any other. An op whose owner can't be told
// stays untagged, which the guard never sends; it's looked at again on the next
// signed-in load. Runs on every signed-in load and sign-in, before the queue
// drains. Returns how many were tagged.
export interface LegacyOwnerLookups {
  device?: string | null;
  /** Note id → author, for the notes this session can see; null when the server can't be asked. */
  serverOwners?: (noteIds: string[]) => Promise<Map<string, string> | null>;
  /** Note id → the account its cached copy belongs to ("" when unknown). */
  cachedOwners?: (noteIds: string[]) => Promise<Map<string, string>>;
}

async function askServerForOwners(noteIds: string[]): Promise<Map<string, string> | null> {
  try {
    const res = await getCloudNoteOwners(noteIds);
    return res.success ? new Map(Object.entries(res.owners)) : null;
  } catch {
    return null;
  }
}

export async function migrateUntaggedCloudOps(
  currentUserId: string | null,
  lookups: LegacyOwnerLookups = {},
): Promise<number> {
  if (!currentUserId) return 0;
  const device = lookups.device === undefined ? deviceUserId() : lookups.device;
  const legacy = (await getAllOps()).filter((op) => needsCloudAccountTag(op.payload, device));
  if (legacy.length === 0) return 0;
  const noteIds = [...new Set(legacy.map((op) => op.payload.noteId))];
  const [server, cached] = await Promise.all([
    (lookups.serverOwners ?? askServerForOwners)(noteIds).catch(() => null),
    (lookups.cachedOwners ?? cachedCloudOwners)(noteIds).catch(() => new Map<string, string>()),
  ]);
  let fixed = 0;
  for (const op of legacy) {
    const owner = legacyOpOwner(server?.get(op.payload.noteId), cached.get(op.payload.noteId), device);
    if (!owner) continue; // unknown: stays parked
    (op.payload as { userId: string }).userId = owner;
    await putOp(op);
    fixed += 1;
  }
  if (fixed > 0) notifySubscribers(await countOps());
  return fixed;
}

// ===========================
// LEAVE-SAFE ENQUEUE (tab hide / close)
// ===========================
//
// enqueue() opens a fresh connection and runs several transactions in a row; a
// closing tab is torn down long before that chain finishes. The leave path keeps
// one warm connection and writes the op in a SINGLE transaction it commits
// explicitly, so the op is durable if the browser gets to run it at all. The
// next app load (or another open tab's refresh) then syncs it to the server.

let leaveDb: IDBDatabase | null = null;
let leaveDbOpening = false;

/** Open (and keep) the connection the leave path writes through. Idempotent. */
export function warmQueueConnection(): void {
  if (leaveDb || leaveDbOpening) return;
  if (typeof indexedDB === "undefined") return;
  leaveDbOpening = true;
  openDB()
    .then((db) => {
      leaveDb = db;
      // Let a future schema upgrade proceed; re-warm lazily on the next write.
      db.onversionchange = () => {
        db.close();
        leaveDb = null;
      };
      db.onclose = () => {
        leaveDb = null;
      };
    })
    .catch(() => {})
    .finally(() => {
      leaveDbOpening = false;
    });
}

/**
 * Queue a content update while the page is hiding/closing. Same collapse rules
 * as enqueue() for an update (folds into a queued create, replaces an older
 * update). Synchronous up to the IDB request: falls back to enqueue() when the
 * warm connection isn't open yet.
 */
export function enqueueContentNow(input: QueuedUpdateOp): void {
  const payload = withAccount(withCopyId(input));
  const db = leaveDb;
  if (!db) {
    warmQueueConnection();
    enqueue(payload).catch(() => {});
    return;
  }
  try {
    const tx = db.transaction(OFFLINE_QUEUE_STORE_NAME, "readwrite");
    const store = tx.objectStore(OFFLINE_QUEUE_STORE_NAME);
    const req = store.index("noteId").getAll(IDBKeyRange.only(payload.noteId));
    req.onsuccess = () => {
      const existing = req.result as QueuedOperation[];
      const createOp = existing.find((op) => op.payload.type === "create");
      if (createOp) {
        const note = (createOp.payload as QueuedCreateOp).note as unknown as Record<string, unknown>;
        note.content = payload.content;
        note.goal = payload.goal;
        note.goal_type = payload.goalType;
        store.put(createOp);
      } else {
        for (const op of existing) {
          if (op.payload.type === "update" && replacesUpdate(op.payload, payload)) {
            store.delete(op.id);
          }
        }
        const timestamp = nextTimestamp();
        store.put({
          id: `op_${timestamp}_${Math.random().toString(36).slice(2, 11)}`,
          payload,
          timestamp,
          retryCount: 0,
          lastAttempt: null,
          origin: TAB_ID,
        } satisfies QueuedOperation);
      }
      tx.commit?.();
    };
    tx.oncomplete = () => {
      countOps().then(notifySubscribers).catch(() => {});
    };
  } catch {
    leaveDb = null;
    enqueue(payload).catch(() => {});
  }
}

export interface PendingNoteContent {
  content: string;
  goal: number;
  goalType: "" | "words" | "characters";
  /** Base version of the queued edit; absent for a queued create / legacy entry. */
  baseVersion?: number;
}

/**
 * The newest queued (not yet synced) content per note: from an update op, or a
 * queued create's note body. Notes with a pending delete are left out. Used so a
 * refresh never shows — or caches — server content older than what is queued.
 */
export async function getPendingContentByNote(): Promise<Map<string, PendingNoteContent>> {
  const result = new Map<string, PendingNoteContent>();
  let ops: QueuedOperation[];
  try {
    ops = await getAllOps();
  } catch {
    return result;
  }
  // Another account's cloud edits are parked, not pending here: they must not
  // put that account's text into this session's notes (or its cache).
  const active = getActiveSupabaseUser();
  ops = ops.filter((o) => shouldSyncOp(o.payload, active));
  const deleted = new Set(ops.filter((o) => o.payload.type === "delete").map((o) => o.payload.noteId));
  for (const op of ops.sort((a, b) => a.timestamp - b.timestamp)) {
    const p = op.payload;
    if (deleted.has(p.noteId)) continue;
    if (p.type === "update") {
      result.set(p.noteId, {
        content: p.content,
        goal: p.goal,
        goalType: p.goalType,
        baseVersion: p.baseVersion,
      });
    } else if (p.type === "create") {
      const n = p.note as unknown as { content?: string; goal?: number; goal_type?: string };
      if (typeof n.content === "string") {
        result.set(p.noteId, {
          content: n.content,
          goal: n.goal ?? 0,
          goalType: (n.goal_type as PendingNoteContent["goalType"]) ?? "",
        });
      }
    }
  }
  return result;
}

export interface LandedSave {
  /** When the save started, from queueClock() (before it was sent). */
  startedAt: number;
  /** The base version the save was made from (before any conflict retry). */
  startBase?: number;
  /** The version the server now holds after it. */
  landedVersion?: number;
  /** The full text that was saved. */
  content: string;
}

/**
 * A save of the FULL content of a note landed. Its queued content updates are
 * superseded — one upload path per note (utils/note-ownership):
 *
 * - Queued before the save started (any tab, any base): dropped. The saving
 *   editor owns the note, and before it could save it took over every entry
 *   that was waiting (adopted the text, or had it replayed through the CAS),
 *   so a later full-content save carries or follows all of them.
 * - Same text as was just saved: dropped (replaying it would be a no-op).
 * - Queued by this tab AFTER the save started from the save's base: kept, and
 *   rebased onto the landed version (typed on top of this save's text, so it
 *   must not later look like a conflict with it).
 */
export async function dropSupersededUpdates(noteId: string, landed: LandedSave): Promise<void> {
  try {
    const ops = await getOpsByNoteId(noteId);
    let changed = false;
    for (const o of ops) {
      if (o.payload.type !== "update") continue;
      const p = o.payload;
      if (sameNoteContent(p.content, landed.content)) {
        await deleteOp(o.id);
        changed = true;
        continue;
      }
      if (o.timestamp <= landed.startedAt) {
        await deleteOp(o.id);
        changed = true;
        continue;
      }
      if (
        o.origin === TAB_ID &&
        typeof landed.landedVersion === "number" &&
        landed.startBase !== undefined &&
        p.baseVersion === landed.startBase
      ) {
        await putOp({ ...o, payload: { ...p, baseVersion: landed.landedVersion } });
      }
    }
    if (changed) notifySubscribers(await countOps());
  } catch {
    /* best effort — a lingering op replays as a CAS write: a no-op or a copy */
  }
}

// Drop every queued op for a note. Called when a note is deleted so a pending
// create/update can't replay and resurrect it on the next processQueue cycle.
export async function dropQueuedOps(noteId: string): Promise<void> {
  await deleteOpsByNoteId(noteId);
  const count = await countOps();
  notifySubscribers(count);
}

/**
 * The editor's text went back to what its last confirmed save put on the
 * server (an edit typed, its save failed, then deleted). The content updates
 * this tab queued for the note since that save are all for the undone text:
 * drop them, so a later replay can't push it. Only this tab's entries, and
 * only updates (a queued create or another tab's entry is not ours to judge).
 * `since` is the confirmed save's start, from queueClock().
 */
export async function dropUpdatesQueuedSince(noteId: string, since: number): Promise<number> {
  let dropped = 0;
  try {
    for (const o of await getOpsByNoteId(noteId)) {
      if (o.payload.type !== "update" || o.origin !== TAB_ID || o.timestamp <= since) continue;
      await deleteOp(o.id);
      dropped++;
    }
    if (dropped) notifySubscribers(await countOps());
  } catch {
    /* best effort — a lingering entry replays as a CAS write */
  }
  return dropped;
}
