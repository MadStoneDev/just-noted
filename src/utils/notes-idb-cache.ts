import { CombinedNote } from "@/types/combined-notes";
import { sameNoteContent } from "@/utils/notes-utils";
import {
  IDB_CACHE_DB_NAME,
  IDB_CACHE_DB_VERSION,
  IDB_CACHE_STORE_NAME,
} from "@/constants/app";

let dbInstance: IDBDatabase | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB not available"));
      return;
    }

    const request = indexedDB.open(IDB_CACHE_DB_NAME, IDB_CACHE_DB_VERSION);

    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_CACHE_STORE_NAME)) {
        db.createObjectStore(IDB_CACHE_STORE_NAME, { keyPath: "id" });
      }
    };
  });

  return dbPromise;
}

/**
 * The cached copy as it should be stored. Only an explicit local edit sets
 * `localEdit`; any other write keeps an existing mark only while the cached text
 * is unchanged (so a store object can never carry a stale mark back in).
 */
function forCache(note: CombinedNote, existing: CombinedNote | undefined, localEdit: boolean): CombinedNote {
  const { localEdit: _ignored, ...rest } = note;
  void _ignored;
  if (localEdit) return { ...rest, localEdit: Date.now() };
  if (existing?.localEdit && sameNoteContent(existing.content, note.content)) {
    return { ...rest, localEdit: existing.localEdit };
  }
  return rest;
}

/**
 * Cache one note. `opts.localEdit` marks text this device typed that no landed
 * save has confirmed yet (the editor's write-ahead, the pre-save and tab-close
 * copies) — see CombinedNote.localEdit.
 */
export async function saveNoteToLocal(note: CombinedNote, opts: { localEdit?: boolean } = {}): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(IDB_CACHE_STORE_NAME, "readwrite");
    const store = tx.objectStore(IDB_CACHE_STORE_NAME);
    const req = store.get(note.id);
    req.onsuccess = () => {
      store.put(forCache(note, req.result as CombinedNote | undefined, !!opts.localEdit));
      // Commit now rather than when the transaction goes idle: on a tab close
      // the page can be torn down before auto-commit, losing the last keystrokes.
      tx.commit?.();
    };
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error("Failed to save note to IDB cache:", error);
  }
}

/**
 * Record a save that just landed: raise the cached copy's version to the
 * server's, in one read-modify-write transaction. Only the version moves — the
 * cached text may already be newer (typed on top of the text being saved, by
 * the same owning editor), and it stays. Without this the cache sits one
 * version behind the server after every save, and a later load pins that stale
 * base: the next save then conflicts with our own earlier text.
 */
export async function setLocalNoteVersion(id: string, version: number, landedContent?: string): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(IDB_CACHE_STORE_NAME, "readwrite");
    const store = tx.objectStore(IDB_CACHE_STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => {
      const cur = req.result as CombinedNote | undefined;
      if (!cur) return;
      const next: CombinedNote = { ...cur, version: Math.max(cur.version ?? 1, version) };
      // The save carried exactly the cached text: it's confirmed now.
      if (landedContent !== undefined && sameNoteContent(cur.content, landedContent)) delete next.localEdit;
      if (next.version !== cur.version || next.localEdit !== cur.localEdit) store.put(next);
    };
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error("Failed to update note version in IDB cache:", error);
  }
}

export async function saveAllNotesToLocal(
  notes: CombinedNote[],
): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(IDB_CACHE_STORE_NAME, "readwrite");
    const store = tx.objectStore(IDB_CACHE_STORE_NAME);
    // Keep this device's unconfirmed text: a record still marked localEdit
    // whose text differs from the incoming copy stays as it is (its own save
    // or the next load's reconcile deals with it). Done in the read's callback
    // so it all stays inside the one transaction.
    const r = store.getAll();
    r.onsuccess = () => {
      const byId = new Map((r.result as CombinedNote[]).map((n) => [n.id, n]));
      store.clear();
      for (const note of notes) {
        const prev = byId.get(note.id);
        if (prev?.localEdit && !sameNoteContent(prev.content, note.content)) store.put(prev);
        else store.put(forCache(note, prev, false));
      }
    };
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error("Failed to save all notes to IDB cache:", error);
  }
}

export async function getAllLocalNotes(): Promise<CombinedNote[]> {
  try {
    const db = await getDB();
    const tx = db.transaction(IDB_CACHE_STORE_NAME, "readonly");
    const store = tx.objectStore(IDB_CACHE_STORE_NAME);
    const request = store.getAll();
    return await new Promise<CombinedNote[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as CombinedNote[]);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Failed to get all notes from IDB cache:", error);
    return [];
  }
}

export async function getLocalNote(
  id: string,
): Promise<CombinedNote | undefined> {
  try {
    const db = await getDB();
    const tx = db.transaction(IDB_CACHE_STORE_NAME, "readonly");
    const store = tx.objectStore(IDB_CACHE_STORE_NAME);
    const request = store.get(id);
    return await new Promise<CombinedNote | undefined>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as CombinedNote | undefined);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Failed to get note from IDB cache:", error);
    return undefined;
  }
}

export async function deleteLocalNote(id: string): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(IDB_CACHE_STORE_NAME, "readwrite");
    const store = tx.objectStore(IDB_CACHE_STORE_NAME);
    store.delete(id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error("Failed to delete note from IDB cache:", error);
  }
}

export async function clearLocalNotes(): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(IDB_CACHE_STORE_NAME, "readwrite");
    const store = tx.objectStore(IDB_CACHE_STORE_NAME);
    store.clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error("Failed to clear IDB cache:", error);
  }
}
