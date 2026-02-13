import { CombinedNote } from "@/types/combined-notes";
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

export async function saveNoteToLocal(note: CombinedNote): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(IDB_CACHE_STORE_NAME, "readwrite");
    const store = tx.objectStore(IDB_CACHE_STORE_NAME);
    store.put(note);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error("Failed to save note to IDB cache:", error);
  }
}

export async function saveAllNotesToLocal(
  notes: CombinedNote[],
): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(IDB_CACHE_STORE_NAME, "readwrite");
    const store = tx.objectStore(IDB_CACHE_STORE_NAME);
    store.clear();
    for (const note of notes) {
      store.put(note);
    }
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
