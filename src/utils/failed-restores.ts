// src/utils/failed-restores.ts
// Guest notes whose Undo failed. The server delete went through, so the
// snapshot taken at delete time is the only copy of the note. It's kept here,
// in its own IndexedDB database, until a restore succeeds or the user
// explicitly discards it. Dismissing the toast or reloading never loses it;
// the next load offers the retry again.

import type { CombinedNote } from "@/types/combined-notes";

export interface FailedRestore {
  id: string;
  /** The guest id the note belongs to. */
  owner: string;
  note: CombinedNote;
  failedAt: number;
}

const DB_NAME = "FailedRestoresDB";
const DB_VERSION = 1;
const STORE = "snapshots";

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

async function run<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await getDB();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = op(t.objectStore(STORE));
    let result: T;
    req.onsuccess = () => {
      result = req.result;
    };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

/** Keep a snapshot whose restore failed. Resolves once it's durable. */
export async function saveFailedRestore(note: CombinedNote, owner: string): Promise<void> {
  const entry: FailedRestore = { id: note.id, owner, note: { ...note, deletedAt: null }, failedAt: Date.now() };
  await run("readwrite", (s) => s.put(entry));
}

/** Drop it: restored, or discarded by the user. */
export async function removeFailedRestore(id: string): Promise<void> {
  await run("readwrite", (s) => s.delete(id));
}

/** This guest's kept snapshots, oldest failure first. */
export async function listFailedRestores(owner: string): Promise<FailedRestore[]> {
  const all = (await run("readonly", (s) => s.getAll())) as FailedRestore[];
  return all.filter((e) => e.owner === owner).sort((a, b) => a.failedAt - b.failedAt);
}

/** Test helper. */
export function resetFailedRestoresDBHandle(): void {
  dbPromise = null;
}
