// Sign-out never wipes unsynced writing (utils/sign-out.ts): the offline queue
// and the IndexedDB cache are scoped per account, so a sign-out parks the
// account's entries instead of clearing them, and a chosen sign-out clears
// only that account's. Real IndexedDB (fake-indexeddb); server actions mocked.
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/app/actions/notes", () => ({
  noteOperation: vi.fn(async () => ({ success: true })),
  fetchNotesRevision: vi.fn(async () => ({ success: true, revision: 0 })),
}));
vi.mock("@/app/actions/supabaseActions", () => ({
  updateNote: vi.fn(async () => ({ success: true })),
  createNote: vi.fn(async () => ({ success: true })),
  updateNoteTitle: vi.fn(async () => ({ success: true })),
  updateNotePinStatus: vi.fn(async () => ({ success: true })),
  updateNotePrivacyStatus: vi.fn(async () => ({ success: true })),
  updateNoteCollapsedStatus: vi.fn(async () => ({ success: true })),
  deleteNote: vi.fn(async () => ({ success: true })),
  getCloudNoteOwners: vi.fn(async () => ({ success: true, owners: {} })),
}));

import {
  enqueue,
  processQueue,
  clearQueue,
  getQueueSize,
  getSendableQueueSize,
  getPendingContentByNote,
  migrateUntaggedCloudOps,
  queuedNoteIdsForAccount,
  parkedNotesByAccount,
  clearAccountOps,
  removedAccountsParked,
  discardRemovedAccountsParked,
} from "./offline-queue";
import { setActiveSupabaseUser, getLastSupabaseUser } from "./offline-queue-guard";
import {
  saveNoteToLocal,
  saveAllNotesToLocal,
  getAllLocalNotes,
  getLocalNote,
  clearLocalNotes,
  clearAccountNotes,
} from "./notes-idb-cache";
import { completeSignOut, syncAccountBeforeSignOut, unsyncedNoteCount } from "./sign-out";
import { updateNote } from "@/app/actions/supabaseActions";
import { noteOperation } from "@/app/actions/notes";

const DEVICE = "device-1111";
const mockedUpdate = vi.mocked(updateNote);
const mockedNoteOp = vi.mocked(noteOperation);

function installBrowser(onLine = true) {
  const store = new Map<string, string>([["notes_user_id", DEVICE]]);
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("navigator", { onLine });
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
}

// What the app enqueues: the notes store's userId is the DEVICE id.
const cloudEdit = (noteId: string, content: string) =>
  enqueue({ type: "update", noteId, source: "supabase", userId: DEVICE, content, goal: 0, goalType: "", baseVersion: 1 });
const localEdit = (noteId: string, content: string) =>
  enqueue({ type: "update", noteId, source: "redis", userId: DEVICE, content, goal: 0, goalType: "", baseVersion: 1 });

async function putRawOp(op: Record<string, unknown>) {
  const { OFFLINE_QUEUE_DB_NAME, OFFLINE_QUEUE_DB_VERSION, OFFLINE_QUEUE_STORE_NAME } = await import("@/constants/app");
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(OFFLINE_QUEUE_DB_NAME, OFFLINE_QUEUE_DB_VERSION);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(OFFLINE_QUEUE_STORE_NAME, "readwrite");
    tx.objectStore(OFFLINE_QUEUE_STORE_NAME).put(op);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

const note = (o: Record<string, unknown>): any => ({
  title: "T",
  content: "text",
  contentFormat: "markdown",
  createdAt: 1,
  updatedAt: 1,
  version: 1,
  isPinned: false,
  isPrivate: false,
  isCollapsed: false,
  order: 0,
  author: "",
  ...o,
});

beforeEach(async () => {
  installBrowser(true);
  setActiveSupabaseUser(null);
  await clearQueue();
  await clearLocalNotes();
  mockedUpdate.mockReset();
  mockedUpdate.mockImplementation(async () => ({ success: true }));
  mockedNoteOp.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe("queue entries are keyed to the account", () => {
  it("a cloud edit is tagged with the signed-in account, a local edit keeps the device id", async () => {
    setActiveSupabaseUser("acct-A");
    await cloudEdit("c1", "cloud");
    await localEdit("l1", "local");
    expect([...(await queuedNoteIdsForAccount("acct-A"))]).toEqual(["c1"]);
    setActiveSupabaseUser(null);
    expect(await parkedNotesByAccount()).toEqual(new Map([["acct-A", new Set(["c1"])]]));
  });

  it("a cloud save failing just after the session ended is queued under that account, and parked", async () => {
    setActiveSupabaseUser("acct-A");
    setActiveSupabaseUser(null); // involuntary sign-out
    expect(getLastSupabaseUser()).toBe("acct-A");
    await cloudEdit("c1", "typed as the session ended");
    await processQueue({ now: true });
    expect(mockedUpdate).not.toHaveBeenCalled();
    expect(await getQueueSize()).toBe(1);
    // Parked: not pending for the signed-out session (no cloud text leaks into it).
    expect((await getPendingContentByNote()).has("c1")).toBe(false);
  });

  it("parked entries survive another account's session and replay when their own signs back in", async () => {
    setActiveSupabaseUser("acct-A");
    await cloudEdit("c1", "A's offline text");
    setActiveSupabaseUser(null);
    setActiveSupabaseUser("acct-B");
    await processQueue({ now: true });
    expect(mockedUpdate).not.toHaveBeenCalled();
    expect((await getPendingContentByNote()).has("c1")).toBe(false);

    expect(await getSendableQueueSize(), "B's session can't send A's entry").toBe(0);
    expect(await getQueueSize()).toBe(1);

    setActiveSupabaseUser("acct-A");
    expect(await getSendableQueueSize()).toBe(1);
    expect((await getPendingContentByNote()).get("c1")?.content).toBe("A's offline text");
    await processQueue({ now: true });
    expect(mockedUpdate).toHaveBeenCalledTimes(1);
    expect(mockedUpdate.mock.calls[0][0]).toBe("c1");
    expect(mockedUpdate.mock.calls[0][4]).toMatchObject({ baseVersion: 1 }); // through the CAS
    expect(await getQueueSize()).toBe(0);
  });

  it("local (guest) entries replay whoever is signed in, or nobody", async () => {
    await localEdit("l1", "guest text");
    await processQueue({ now: true });
    expect(mockedNoteOp).toHaveBeenCalledWith("redis", expect.objectContaining({ noteId: "l1", userId: DEVICE }));
  });

  it("clearAccountOps drops only that account's cloud entries", async () => {
    setActiveSupabaseUser("acct-B");
    await cloudEdit("b1", "B");
    setActiveSupabaseUser("acct-A");
    await cloudEdit("a1", "A");
    await localEdit("l1", "guest");
    expect(await clearAccountOps("acct-A")).toBe(1);
    expect(await queuedNoteIdsForAccount("acct-A")).toEqual(new Set());
    expect(await queuedNoteIdsForAccount("acct-B")).toEqual(new Set(["b1"]));
    expect(await getQueueSize()).toBe(2);
  });

  it("an entry tagged with the device id by an older build goes to the account its cached note belongs to", async () => {
    // Older builds tagged cloud ops with the device id, as left in IndexedDB.
    for (const id of ["old1", "old2", "old3"]) {
      await putRawOp({
        id: `op_${id}`,
        payload: { type: "update", noteId: id, source: "supabase", userId: DEVICE, content: "legacy", goal: 0, goalType: "" },
        timestamp: Date.now(),
        retryCount: 0,
        lastAttempt: null,
      });
    }
    // Cached copies: old1 is A's, old2 is B's; old3 isn't cached. (The mocked
    // server sees none of them.)
    setActiveSupabaseUser("acct-A");
    await saveNoteToLocal(note({ id: "old1", source: "supabase", author: DEVICE }));
    setActiveSupabaseUser("acct-B");
    await saveNoteToLocal(note({ id: "old2", source: "supabase", author: DEVICE }));

    setActiveSupabaseUser("acct-A");
    expect(await queuedNoteIdsForAccount("acct-A")).toEqual(new Set());
    expect(await migrateUntaggedCloudOps("acct-A")).toBe(2);
    expect(await queuedNoteIdsForAccount("acct-A")).toEqual(new Set(["old1"]));
    expect(await queuedNoteIdsForAccount("acct-B")).toEqual(new Set(["old2"]));
    expect(await getSendableQueueSize()).toBe(1); // old3: owner unknown, parked
  });

  it("processQueue({ now }) retries an entry that is still waiting out its backoff", async () => {
    setActiveSupabaseUser("acct-A");
    mockedUpdate.mockImplementationOnce(async () => ({ success: false, error: "network" }));
    await cloudEdit("c1", "x");
    await processQueue(); // fails, backs off
    expect(await getQueueSize()).toBe(1);
    await processQueue(); // inside the backoff: skipped
    expect(mockedUpdate).toHaveBeenCalledTimes(1);
    await processQueue({ now: true });
    expect(mockedUpdate).toHaveBeenCalledTimes(2);
    expect(await getQueueSize()).toBe(0);
  });
});

describe("the note cache is scoped to the account", () => {
  async function seed() {
    setActiveSupabaseUser("acct-A");
    await saveNoteToLocal(note({ id: "a1", source: "supabase", author: "acct-A" }));
    await saveNoteToLocal(note({ id: "a-new", source: "supabase", author: DEVICE }), { localEdit: true }); // made offline
    await saveNoteToLocal(note({ id: "g1", source: "redis", author: DEVICE }), { localEdit: true });
    setActiveSupabaseUser("acct-B");
    await saveNoteToLocal(note({ id: "b1", source: "supabase", author: "acct-B" }));
  }
  const ids = async () => (await getAllLocalNotes()).map((n) => n.id).sort();

  it("reads show local notes plus the signed-in account's cloud notes only", async () => {
    await seed();
    expect(await ids()).toEqual(["b1", "g1"]);
    setActiveSupabaseUser("acct-A");
    expect(await ids()).toEqual(["a-new", "a1", "g1"]);
    setActiveSupabaseUser(null);
    expect(await ids()).toEqual(["g1"]);
    // A note created offline (author = device id) was tagged with its account.
    expect((await getLocalNote("a-new"))?.account).toBe("acct-A");
  });

  it("a full rewrite while signed out keeps every account's parked copies", async () => {
    await seed();
    setActiveSupabaseUser(null);
    await saveAllNotesToLocal([note({ id: "g1", source: "redis", content: "refreshed" })]);
    setActiveSupabaseUser("acct-A");
    expect(await ids()).toEqual(["a-new", "a1", "g1"]);
    expect((await getLocalNote("a-new"))?.localEdit).toBeGreaterThan(0);
    setActiveSupabaseUser("acct-B");
    expect(await ids()).toEqual(["b1", "g1"]);
  });

  it("clearAccountNotes drops that account's cloud copies only", async () => {
    await seed();
    expect(await clearAccountNotes("acct-A")).toBe(2);
    setActiveSupabaseUser("acct-A");
    expect(await ids()).toEqual(["g1"]);
    setActiveSupabaseUser("acct-B");
    expect(await ids()).toEqual(["b1", "g1"]);
    expect((await getLocalNote("g1"))?.localEdit).toBeGreaterThan(0);
  });
});

describe("a sign-out the user chose", () => {
  const fakeSupabase = (error: { name: string; message: string } | null = null) =>
    ({ auth: { signOut: vi.fn(async () => ({ error })) } }) as any;

  it("waits for the account's edits; once they land, clears only its data", async () => {
    setActiveSupabaseUser("acct-B");
    await cloudEdit("b1", "B parked");
    setActiveSupabaseUser("acct-A");
    await cloudEdit("a1", "A unsynced");
    await localEdit("l1", "guest unsynced");
    await saveNoteToLocal(note({ id: "a1", source: "supabase", author: "acct-A" }), { localEdit: true });
    await saveNoteToLocal(note({ id: "g1", source: "redis" }), { localEdit: true });
    mockedNoteOp.mockImplementation(async () => ({ success: false, error: "keep guest op queued" }) as any);

    expect(await unsyncedNoteCount("acct-A")).toBe(1);
    expect(await syncAccountBeforeSignOut("acct-A", { gapMs: 0 })).toBe(0);
    expect(mockedUpdate).toHaveBeenCalledWith("a1", "A unsynced", 0, "", expect.objectContaining({ baseVersion: 1 }));

    const supabase = fakeSupabase();
    expect(await completeSignOut(supabase, "acct-A")).toEqual({ ok: true });
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: "local" }); // this device only
    expect(await queuedNoteIdsForAccount("acct-B")).toEqual(new Set(["b1"])); // other account: kept
    expect(await getLocalNote("a1")).toBeUndefined();
    expect((await getLocalNote("g1"))?.localEdit).toBeGreaterThan(0); // guest note: kept
    expect(await getQueueSize()).toBe(2); // B's parked op + the guest op
  });

  it("reports what couldn't sync (offline) and touches nothing", async () => {
    setActiveSupabaseUser("acct-A");
    await cloudEdit("a1", "A unsynced");
    installBrowser(false);
    expect(await syncAccountBeforeSignOut("acct-A", { gapMs: 0 })).toBe(1);
    expect(mockedUpdate).not.toHaveBeenCalled();
    expect(await queuedNoteIdsForAccount("acct-A")).toEqual(new Set(["a1"]));
  });

  it("offline, 'sign out anyway' still ends the session on this device", async () => {
    setActiveSupabaseUser("acct-A");
    const cookies: string[] = [];
    vi.stubGlobal("document", {
      get cookie() {
        return "sb-x-auth-token.0=abc; other=1";
      },
      set cookie(v: string) {
        cookies.push(v);
      },
    });
    const supabase = fakeSupabase({ name: "AuthRetryableFetchError", message: "Failed to fetch" });
    expect(await completeSignOut(supabase, "acct-A")).toEqual({ ok: true });
    expect(cookies).toEqual(["sb-x-auth-token.0=; Max-Age=0; path=/"]);
  });

  it("'sign out everywhere' offline fails instead of pretending", async () => {
    setActiveSupabaseUser("acct-A");
    await cloudEdit("a1", "kept");
    const supabase = fakeSupabase({ name: "AuthRetryableFetchError", message: "Failed to fetch" });
    const res = await completeSignOut(supabase, "acct-A", { scope: "global" });
    expect(res.ok).toBe(false);
    expect(await queuedNoteIdsForAccount("acct-A")).toEqual(new Set(["a1"])); // nothing cleared
  });
});

describe("a removed account's parked notes (Settings → Sync & data)", () => {
  async function park(account: string, noteId: string, text: string) {
    setActiveSupabaseUser(account);
    await cloudEdit(noteId, text);
    await saveNoteToLocal(note({ id: noteId, source: "supabase", author: account, content: text }), { localEdit: true });
  }

  it("lists only accounts no longer on the device; discarding drops just their entries and cached copies", async () => {
    await park("acct-gone", "g1", "gone 1");
    await park("acct-gone", "g2", "gone 2");
    await park("acct-B", "b1", "B's, still on the device");
    // An untagged cached copy and a device-id entry: nobody's known account.
    await putRawOp({
      id: "op_legacy",
      payload: { type: "update", noteId: "u1", source: "supabase", userId: DEVICE, content: "legacy", goal: 0, goalType: "" },
      timestamp: Date.now(),
      retryCount: 0,
      lastAttempt: null,
    });
    setActiveSupabaseUser(null);
    await saveNoteToLocal(note({ id: "u1", source: "supabase", author: DEVICE, content: "legacy" }));
    setActiveSupabaseUser("acct-A");

    const removed = await removedAccountsParked(["acct-A", "acct-B"]);
    expect(removed).toEqual(new Map([["acct-gone", new Set(["g1", "g2"])]]));

    // Nothing is deleted until asked.
    expect(await queuedNoteIdsForAccount("acct-gone")).toEqual(new Set(["g1", "g2"]));

    expect(await discardRemovedAccountsParked(["acct-A", "acct-B"])).toBe(2);
    expect(await queuedNoteIdsForAccount("acct-gone")).toEqual(new Set());
    expect(await getLocalNote("g1")).toBeUndefined();
    expect(await getLocalNote("g2")).toBeUndefined();
    // Everyone else's kept.
    expect(await queuedNoteIdsForAccount("acct-B")).toEqual(new Set(["b1"]));
    expect(await getQueueSize()).toBe(2); // b1 + the legacy entry
    setActiveSupabaseUser("acct-B");
    expect((await getLocalNote("b1"))?.content).toBe("B's, still on the device");
    setActiveSupabaseUser("acct-A");
    expect(await getLocalNote("u1")).toBeDefined();
    expect(await removedAccountsParked(["acct-A", "acct-B"])).toEqual(new Map());
  });

  it("an account added back before the discard keeps its entries", async () => {
    await park("acct-gone", "g1", "gone");
    setActiveSupabaseUser("acct-A");
    expect((await removedAccountsParked(["acct-A"])).size).toBe(1);
    expect(await discardRemovedAccountsParked(["acct-A", "acct-gone"])).toBe(0);
    expect(await queuedNoteIdsForAccount("acct-gone")).toEqual(new Set(["g1"]));
  });
});
