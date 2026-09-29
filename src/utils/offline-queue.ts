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
} from "@/app/actions/supabaseActions";
import type { RedisNote, CombinedNote } from "@/types/combined-notes";
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

export async function enqueue(payload: QueuedOperationPayload): Promise<void> {
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

    // Rule 1: Same noteId + same type → replace older
    const sameTypeOp = existing.find((op) => op.payload.type === payload.type);
    if (sameTypeOp) {
      await deleteOp(sameTypeOp.id);
    }
  }

  // Add new op
  const op: QueuedOperation = {
    id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    payload,
    timestamp: Date.now(),
    retryCount: 0,
    lastAttempt: null,
  };

  await putOp(op);

  const count = await countOps();
  notifySubscribers(count);
}

// ===========================
// PROCESS QUEUE
// ===========================

let processing = false;

function throwIfFailed(result: { success: boolean; error?: string }, fallback: string): void {
  if (!result.success) {
    throw new Error(result.error || fallback);
  }
}

async function executeOp(payload: QueuedOperationPayload): Promise<void> {
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
      const { content, goal, goalType } = payload;
      if (source === "redis") {
        throwIfFailed(await noteOperation("redis", { operation: "update", userId, noteId, content, goal, goalType }), "Update failed");
      } else {
        // Replayed queued edits use the legacy (always-land + history snapshot)
        // path so an offline edit is never rejected as "stale" with no UI to
        // resolve it; the prior server content is preserved in history.
        throwIfFailed(await updateSupabaseNote(noteId, content, goal, goalType, { allowLegacy: true }), "Update failed");
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

export async function processQueue(): Promise<void> {
  if (processing) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  processing = true;

  try {
    const ops = (await getAllOps()).sort((a, b) => a.timestamp - b.timestamp);
    const now = Date.now();
    // Per-note ordering: if a note's op fails or is waiting out its backoff,
    // skip its later ops this pass, but keep syncing OTHER notes (one stuck note
    // must not block the whole queue).
    const blocked = new Set<string>();
    let nextWakeup = Infinity;

    for (const op of ops) {
      const noteId = op.payload.noteId;
      if (blocked.has(noteId)) continue;

      // Respect exponential backoff for previously-failed ops.
      if (op.retryCount > 0 && op.lastAttempt) {
        const waitLeft = backoffMs(op.retryCount) - (now - op.lastAttempt);
        if (waitLeft > 0) {
          blocked.add(noteId);
          nextWakeup = Math.min(nextWakeup, waitLeft);
          continue;
        }
      }

      try {
        await executeOp(op.payload);
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

export async function clearQueue(): Promise<void> {
  await clearAllOps();
  notifySubscribers(0);
}

// Drop every queued op for a note. Called when a note is deleted so a pending
// create/update can't replay and resurrect it on the next processQueue cycle.
export async function dropQueuedOps(noteId: string): Promise<void> {
  await deleteOpsByNoteId(noteId);
  const count = await countOps();
  notifySubscribers(count);
}
