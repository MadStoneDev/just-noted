import { CombinedNote } from "@/types/combined-notes";
import { sameNoteContent } from "@/utils/notes-utils";
import { cloudAccountFor, deviceUserId, getActiveSupabaseUser } from "@/utils/offline-queue-guard";
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

// ── Account scoping ─────────────────────────────────────────────────────────
//
// One cache holds this device's local (guest) notes and the cloud notes of
// every account that has used it. Reads and full rewrites see only local notes
// plus the signed-in account's cloud notes; another account's cloud copies are
// parked untouched until it signs in again. A sign-out never clears local notes
// or other accounts' copies (clearAccountNotes only, after a chosen sign-out).

/** Whose cloud copy this is: an account id, "" when unknown (cached before
 *  copies were tagged), null for a local note (belongs to the device). */
function ownerOf(rec: CombinedNote): string | null {
  if (rec.source !== "supabase") return null;
  if (rec.account) return rec.account;
  const author = rec.author || "";
  return author && author !== deviceUserId() ? author : "";
}

/** Visible to the session signed in as `active` (null = signed out). An
 *  untagged cloud copy belongs to whoever is signed in, as before tagging. */
function inScope(rec: CombinedNote, active: string | null): boolean {
  const owner = ownerOf(rec);
  if (owner === null) return true;
  if (owner === "") return !!active;
  return owner === active;
}

/**
 * The cached copy as it should be stored. Only an explicit local edit sets
 * `localEdit`; any other write keeps an existing mark only while the cached text
 * is unchanged (so a store object can never carry a stale mark back in).
 */
function forCache(
  note: CombinedNote,
  existing: CombinedNote | undefined,
  localEdit: boolean | number,
): CombinedNote {
  const { localEdit: _ignored, account: _acc, ...base } = note;
  void _ignored;
  void _acc;
  // A cloud copy keeps the account it was first cached for; a new one takes the
  // account signed in now (or, just after a sign-out, the one that was).
  const tag = note.source === "supabase" ? existing?.account || note.account || cloudAccountFor(note.author) : "";
  const account = tag && tag !== deviceUserId() ? tag : undefined;
  const rest: CombinedNote = account ? { ...base, account } : base;
  if (typeof localEdit === "number") return { ...rest, localEdit };
  if (localEdit) return { ...rest, localEdit: Date.now() };
  if (existing?.localEdit && sameNoteContent(existing.content, note.content)) {
    return { ...rest, localEdit: existing.localEdit };
  }
  return rest;
}

/**
 * Cache one note. `opts.localEdit` marks text this device typed that no landed
 * save has confirmed yet (the editor's write-ahead, the pre-save and tab-close
 * copies) — see CombinedNote.localEdit. A number restores that exact mark (the
 * editor putting back the mark its opening text had).
 */
export async function saveNoteToLocal(
  note: CombinedNote,
  opts: { localEdit?: boolean | number } = {},
): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(IDB_CACHE_STORE_NAME, "readwrite");
    const store = tx.objectStore(IDB_CACHE_STORE_NAME);
    const req = store.get(note.id);
    req.onsuccess = () => {
      store.put(forCache(note, req.result as CombinedNote | undefined, opts.localEdit ?? false));
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

/**
 * A queued write carrying `landedContent` reached the server: if that is
 * exactly the cached text, the copy is confirmed, so its localEdit mark goes.
 * The version is left alone (a replay doesn't always report it); a cached text
 * newer than what landed keeps its mark.
 */
export async function confirmLocalEditIfLanded(id: string, landedContent: string): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(IDB_CACHE_STORE_NAME, "readwrite");
    const store = tx.objectStore(IDB_CACHE_STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => {
      const cur = req.result as CombinedNote | undefined;
      if (!cur?.localEdit || !sameNoteContent(cur.content, landedContent)) return;
      const next: CombinedNote = { ...cur };
      delete next.localEdit;
      store.put(next);
    };
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error("Failed to confirm cached note:", error);
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
      const active = getActiveSupabaseUser();
      const all = r.result as CombinedNote[];
      const byId = new Map(all.map((n) => [n.id, n]));
      // Replace this session's view only: other accounts' parked copies stay.
      for (const n of all) if (inScope(n, active)) store.delete(n.id);
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
    const active = getActiveSupabaseUser();
    return await new Promise<CombinedNote[]>((resolve, reject) => {
      request.onsuccess = () => resolve((request.result as CombinedNote[]).filter((n) => inScope(n, active)));
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

/**
 * Drop one account's cached cloud copies (and, unless `includeUntagged` is
 * false, untagged cloud copies, which were that account's while it was signed
 * in). Local notes and other accounts' copies stay. Only for a sign-out the
 * user chose, or discarding a removed account's notes (untagged kept: they
 * aren't that account's). Returns how many went.
 *
 * Copies marked localEdit (text not yet confirmed by the server) stay too,
 * unless `keepLocalEdits` is false: only an explicit choice to lose unsynced
 * writing ("Sign out anyway", discarding a removed account's notes) passes it.
 */
export async function clearAccountNotes(
  accountId: string,
  opts: { includeUntagged?: boolean; keepLocalEdits?: boolean } = {},
): Promise<number> {
  if (!accountId) return 0;
  const includeUntagged = opts.includeUntagged ?? true;
  const keepLocalEdits = opts.keepLocalEdits ?? true;
  let dropped = 0;
  try {
    const db = await getDB();
    const tx = db.transaction(IDB_CACHE_STORE_NAME, "readwrite");
    const store = tx.objectStore(IDB_CACHE_STORE_NAME);
    const r = store.getAll();
    r.onsuccess = () => {
      for (const n of r.result as CombinedNote[]) {
        const owner = ownerOf(n);
        if (owner === accountId || (includeUntagged && owner === "")) {
          if (keepLocalEdits && n.localEdit) continue;
          store.delete(n.id);
          dropped++;
        }
      }
    };
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error("Failed to clear account notes from IDB cache:", error);
  }
  return dropped;
}

/**
 * Per note id, the account its cached cloud copy belongs to ("" when unknown:
 * cached untagged by an older build). Notes not cached, or local, are absent.
 * Reads every copy, whichever account it belongs to.
 */
export async function cachedCloudOwners(noteIds: Iterable<string>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const wanted = new Set(noteIds);
  if (wanted.size === 0) return out;
  try {
    const db = await getDB();
    const tx = db.transaction(IDB_CACHE_STORE_NAME, "readonly");
    const r = tx.objectStore(IDB_CACHE_STORE_NAME).getAll();
    await new Promise<void>((resolve, reject) => {
      r.onsuccess = () => {
        for (const n of r.result as CombinedNote[]) {
          if (!wanted.has(n.id)) continue;
          const owner = ownerOf(n);
          if (owner !== null) out.set(n.id, owner);
        }
        resolve();
      };
      r.onerror = () => reject(r.error);
    });
  } catch (error) {
    console.error("Failed to read cached note owners:", error);
  }
  return out;
}

/** Wipes the WHOLE cache, local notes included. Not for sign-out. */
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
