// Integration test for the offline queue's B7 behaviour against a real IndexedDB
// (fake-indexeddb). The server actions are mocked so nothing touches the network;
// we assert which ops processQueue actually sends.
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
  migrateUntaggedCloudOps,
} from "./offline-queue";
import { setActiveSupabaseUser } from "./offline-queue-guard";
import { updateNote } from "@/app/actions/supabaseActions";
import { noteOperation } from "@/app/actions/notes";

const mockedUpdate = vi.mocked(updateNote);
const mockedNoteOp = vi.mocked(noteOperation);

function cloudUpdate(noteId: string, userId: string) {
  return enqueue({
    type: "update",
    noteId,
    source: "supabase",
    userId,
    content: `c-${noteId}`,
    goal: 0,
    goalType: "",
  });
}

beforeEach(async () => {
  // processQueue early-returns when navigator reports offline; force online.
  vi.stubGlobal("navigator", { onLine: true });
  mockedUpdate.mockClear();
  mockedNoteOp.mockClear();
  await clearQueue();
  setActiveSupabaseUser(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("processQueue — B7 cross-account guard (real IDB)", () => {
  it("flushes only the active account's cloud ops; a skipped op never blocks another note", async () => {
    setActiveSupabaseUser("userA");
    await cloudUpdate("noteA1", "userA");
    await cloudUpdate("noteB1", "userB"); // different account → must be skipped
    await cloudUpdate("noteA2", "userA"); // queued AFTER the skipped B op

    await processQueue();

    const sentNoteIds = mockedUpdate.mock.calls.map((c) => c[0]);
    expect(sentNoteIds).toContain("noteA1");
    expect(sentNoteIds).toContain("noteA2"); // not blocked by B's skipped op
    expect(sentNoteIds).not.toContain("noteB1");
    // B's op is left in the queue untouched (no failure, no drop) for when @B signs in.
    expect(await getQueueSize()).toBe(1);
  });

  it("leaves ALL cloud ops queued when signed out (never mis-sends)", async () => {
    setActiveSupabaseUser(null);
    await cloudUpdate("note1", "userA");
    await processQueue();
    expect(mockedUpdate).not.toHaveBeenCalled();
    expect(await getQueueSize()).toBe(1);
  });

  it("always flushes Redis (device) ops regardless of the active account", async () => {
    setActiveSupabaseUser("userA");
    await enqueue({
      type: "update",
      noteId: "localNote",
      source: "redis",
      userId: "guest-device-id",
      content: "y",
      goal: 0,
      goalType: "",
    });
    await processQueue();
    expect(mockedNoteOp).toHaveBeenCalled();
    expect(await getQueueSize()).toBe(0);
  });
});

describe("migrateUntaggedCloudOps — legacy entries replay only for their note's owner (real IDB)", () => {
  const DEVICE = "device-1";
  const legacyOp = (noteId: string, userId: string) =>
    putForeignOp({
      id: `op_${noteId}`,
      payload: { type: "update", noteId, source: "supabase", userId, content: `x-${noteId}`, goal: 0, goalType: "" },
      timestamp: Date.now(),
      retryCount: 0,
      lastAttempt: null,
    });
  const owners = (m: Record<string, string>) => async () => new Map(Object.entries(m));
  const sent = () => mockedUpdate.mock.calls.map((c) => c[0]);

  it("an entry whose note the server says is ours is tagged and flushes", async () => {
    await legacyOp("legacy1", ""); // blank tag
    await legacyOp("legacy2", DEVICE); // device-id tag

    // Untagged: the guard skips it.
    setActiveSupabaseUser("userA");
    await processQueue();
    expect(mockedUpdate).not.toHaveBeenCalled();

    const fixed = await migrateUntaggedCloudOps("userA", {
      device: DEVICE,
      serverOwners: owners({ legacy1: "userA", legacy2: "userA" }),
      cachedOwners: owners({}),
    });
    expect(fixed).toBe(2);
    await processQueue();
    expect(mockedUpdate).toHaveBeenCalledWith("legacy1", "x-legacy1", 0, "", {
      queuedAt: expect.any(Number),
      conflictCopy: expect.objectContaining({ id: expect.any(String) }),
    });
    expect(sent()).toContain("legacy2");
    expect(await getQueueSize()).toBe(0);
  });

  it("another account's note: tagged with its owner and parked, never sent under this session", async () => {
    await legacyOp("theirs", DEVICE);
    setActiveSupabaseUser("userA");
    await migrateUntaggedCloudOps("userA", {
      device: DEVICE,
      serverOwners: owners({ theirs: "userB" }), // shared with A, owned by B
      cachedOwners: owners({ theirs: "userA" }), // the server wins
    });
    await processQueue();
    expect(sent()).not.toContain("theirs");
    expect(await getQueueSize()).toBe(1);

    // B signs in on this device: it replays for B.
    setActiveSupabaseUser("userB");
    await processQueue();
    expect(sent()).toContain("theirs");
    expect(await getQueueSize()).toBe(0);
  });

  it("server unreachable: the cached copy's account decides", async () => {
    await legacyOp("mine", DEVICE);
    await legacyOp("cachedB", DEVICE);
    setActiveSupabaseUser("userA");
    const fixed = await migrateUntaggedCloudOps("userA", {
      device: DEVICE,
      serverOwners: async () => null,
      cachedOwners: owners({ mine: "userA", cachedB: "userB" }),
    });
    expect(fixed).toBe(2);
    await processQueue();
    expect(sent()).toEqual(["mine"]);
    expect(await getQueueSize()).toBe(1);
  });

  it("owner unknown (not visible on the server, no tagged cached copy): stays parked and untagged", async () => {
    await legacyOp("orphan", DEVICE);
    await legacyOp("orphan2", "");
    setActiveSupabaseUser("userA");
    const fixed = await migrateUntaggedCloudOps("userA", {
      device: DEVICE,
      serverOwners: owners({}),
      cachedOwners: owners({ orphan: "" }), // cached untagged by an older build
    });
    expect(fixed).toBe(0);
    await processQueue();
    expect(mockedUpdate).not.toHaveBeenCalled();
    expect(await getQueueSize()).toBe(2);

    // A later load, the owner now known: it's tagged then.
    expect(
      await migrateUntaggedCloudOps("userA", { device: DEVICE, serverOwners: owners({ orphan: "userA" }), cachedOwners: owners({}) }),
    ).toBe(1);
  });

  it("is a no-op with no active user, and leaves already-tagged ops alone", async () => {
    await cloudUpdate("tagged1", "userA");
    const lookups = { device: DEVICE, serverOwners: owners({ tagged1: "userB" }), cachedOwners: owners({}) };
    expect(await migrateUntaggedCloudOps(null, lookups)).toBe(0);
    expect(await migrateUntaggedCloudOps("userB", lookups)).toBe(0); // tagged1 already has userA
  });
});

describe("leave-path queue helpers (real IDB)", () => {
  it("enqueueContentNow collapses into one update and is readable as pending", async () => {
    const { enqueueContentNow, warmQueueConnection, getPendingContentByNote } = await import(
      "./offline-queue"
    );
    warmQueueConnection();
    await new Promise((r) => setTimeout(r, 20));
    const op = (content: string) => ({
      type: "update" as const,
      noteId: "leave-1",
      source: "redis" as const,
      userId: "u",
      content,
      goal: 0,
      goalType: "" as const,
    });
    await enqueue(op("first"));
    enqueueContentNow(op("typed before close"));
    await new Promise((r) => setTimeout(r, 50));
    expect(await getQueueSize()).toBe(1);
    expect((await getPendingContentByNote()).get("leave-1")?.content).toBe("typed before close");
  });

  it("enqueueContentNow folds into a queued create", async () => {
    const { enqueueContentNow, getPendingContentByNote } = await import("./offline-queue");
    await enqueue({
      type: "create",
      noteId: "leave-2",
      source: "redis",
      userId: "u",
      note: { id: "leave-2", content: "" } as any,
    });
    enqueueContentNow({
      type: "update", noteId: "leave-2", source: "redis", userId: "u",
      content: "body", goal: 0, goalType: "",
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(await getQueueSize()).toBe(1);
    expect((await getPendingContentByNote()).get("leave-2")?.content).toBe("body");
  });

  it("a pending delete hides the note's queued content", async () => {
    const { getPendingContentByNote } = await import("./offline-queue");
    await cloudUpdate("leave-3", "u");
    await enqueue({ type: "delete", noteId: "leave-3", source: "supabase", userId: "u" });
    expect((await getPendingContentByNote()).has("leave-3")).toBe(false);
  });

  it("dropSupersededUpdates removes only this note's updates queued before the save", async () => {
    const { dropSupersededUpdates } = await import("./offline-queue");
    await cloudUpdate("leave-4", "u");
    await cloudUpdate("leave-4b", "u"); // another note: never touched
    await enqueue({ type: "updateTitle", noteId: "leave-4", source: "supabase", userId: "u", title: "t" });
    const landed = { startedAt: Date.now(), content: "something else" };
    await dropSupersededUpdates("leave-4", landed);
    expect(await getQueueSize()).toBe(2); // the title op + the other note's update
    await dropSupersededUpdates("leave-4", landed);
    expect(await getQueueSize()).toBe(2);
  });

  it("dropSupersededUpdates also removes a newer update holding the saved text", async () => {
    const { dropSupersededUpdates } = await import("./offline-queue");
    const startedAt = Date.now() - 1000; // the save started before this op was queued
    await cloudUpdate("leave-5", "u"); // content "c-leave-5"
    await dropSupersededUpdates("leave-5", { startedAt, content: "c-leave-6" });
    expect(await getQueueSize()).toBe(1); // different text: kept
    await dropSupersededUpdates("leave-5", { startedAt, content: "c-leave-5\n" });
    expect(await getQueueSize()).toBe(0);
  });
});

// ── Versioned (CAS) queue entries ────────────────────────────────────────────

const OTHER_TAB = "some-other-tab";

/** Write an op as if another tab of this browser had queued it. */
async function putForeignOp(op: Record<string, unknown>) {
  const { OFFLINE_QUEUE_DB_NAME, OFFLINE_QUEUE_DB_VERSION, OFFLINE_QUEUE_STORE_NAME } = await import(
    "@/constants/app"
  );
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

async function readOp(id: string): Promise<any> {
  const { OFFLINE_QUEUE_DB_NAME, OFFLINE_QUEUE_DB_VERSION, OFFLINE_QUEUE_STORE_NAME } = await import(
    "@/constants/app"
  );
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(OFFLINE_QUEUE_DB_NAME, OFFLINE_QUEUE_DB_VERSION);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  const op = await new Promise<any>((resolve, reject) => {
    const req = db.transaction(OFFLINE_QUEUE_STORE_NAME, "readonly").objectStore(OFFLINE_QUEUE_STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return op;
}

const upd = (noteId: string, content: string, baseVersion?: number) => ({
  type: "update" as const,
  noteId,
  source: "supabase" as const,
  userId: "u",
  content,
  goal: 0,
  goalType: "" as const,
  baseVersion,
});

describe("versioned queue entries (real IDB)", () => {
  // The entries belong to account "u", signed in (cloud pending content is
  // only read for the signed-in account).
  beforeEach(() => setActiveSupabaseUser("u"));
  it("replays as a background CAS write with a fixed copy id; a conflict is reported", async () => {
    const { subscribeConflicts } = await import("./offline-queue");
    setActiveSupabaseUser("u");
    mockedUpdate.mockResolvedValueOnce({ success: true, version: 9, conflicted: true, copyId: "x" });
    const seen: string[] = [];
    const off = subscribeConflicts((p) => seen.push(p.noteId));
    await enqueue(upd("v-1", "queued text", 3));
    await processQueue();
    off();

    expect(mockedUpdate).toHaveBeenCalledTimes(1);
    const [, content, , , opts] = mockedUpdate.mock.calls[0];
    expect(content).toBe("queued text");
    expect(opts).toMatchObject({ baseVersion: 3 });
    expect(opts?.allowLegacy).toBeUndefined(); // never the always-land path
    expect(opts?.conflictCopy?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(seen).toEqual(["v-1"]);
    expect(await getQueueSize()).toBe(0);
  });

  it("an entry from an older build (no base, no copy id) CAS-replays on its queued time", async () => {
    setActiveSupabaseUser("u");
    // As written by an older build: no baseVersion, no copyId.
    await putForeignOp({
      id: "op_legacy",
      payload: { ...upd("v-2", "legacy text"), baseVersion: undefined },
      timestamp: 1_700_000_000_000,
      retryCount: 0,
      lastAttempt: null,
    });
    // The copy id sent to the server must already be persisted on the entry,
    // so a retry after a lost response can't make a second copy.
    let storedAtSend: any;
    mockedUpdate.mockImplementationOnce(async () => {
      storedAtSend = await readOp("op_legacy");
      return { success: true, version: 4 };
    });
    await processQueue();
    const opts = mockedUpdate.mock.calls[0][4];
    expect(opts).toMatchObject({ queuedAt: 1_700_000_000_000 });
    expect(opts?.allowLegacy).toBeUndefined(); // never the always-land path
    expect(opts?.baseVersion).toBeUndefined();
    expect(opts?.conflictCopy?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(storedAtSend.payload.copyId).toBe(opts?.conflictCopy?.id);
    expect(await getQueueSize()).toBe(0);
  });

  it("a newer edit from a different base does not replace an older queued one", async () => {
    const { getPendingContentByNote } = await import("./offline-queue");
    await enqueue(upd("v-3", "typed on v3", 3));
    await enqueue(upd("v-3", "typed on v3, more", 3)); // same base: replaces
    expect(await getQueueSize()).toBe(1);
    await enqueue(upd("v-3", "typed after adopting v5", 5)); // different base: kept
    expect(await getQueueSize()).toBe(2);
    expect((await getPendingContentByNote()).get("v-3")).toMatchObject({
      content: "typed after adopting v5",
      baseVersion: 5,
    });
  });

  // One upload path per note: before an editor writes a note it takes over
  // every waiting entry (adopts the text, or has it replayed through the CAS),
  // so a later successful save supersedes them all — this tab's or another's.
  it("a later successful save supersedes another tab's earlier entry", async () => {
    const { dropSupersededUpdates } = await import("./offline-queue");
    await putForeignOp({
      id: "op_foreign",
      payload: upd("v-4", "typed in the closed tab", 3),
      timestamp: Date.now() - 5000,
      retryCount: 0,
      lastAttempt: null,
      origin: OTHER_TAB,
    });
    await dropSupersededUpdates("v-4", {
      startedAt: Date.now(),
      startBase: 3,
      landedVersion: 4,
      content: "this tab's text",
    });
    expect(await getQueueSize()).toBe(0);
  });

  it("drops every entry queued before the save started, whatever its base", async () => {
    const { dropSupersededUpdates, getPendingContentByNote, queueClock } = await import("./offline-queue");
    await enqueue(upd("v-5", "earlier draft", 4));
    await enqueue(upd("v-6", "text from before adopting v7", 4));
    const startedAt = queueClock(); // the same strictly-ordered clock the save uses
    await dropSupersededUpdates("v-5", { startedAt, startBase: 4, landedVersion: 5, content: "final" });
    await dropSupersededUpdates("v-6", { startedAt, startBase: 7, landedVersion: 8, content: "final" });
    const pending = await getPendingContentByNote();
    expect(pending.has("v-5")).toBe(false);
    expect(pending.has("v-6")).toBe(false);
  });

  it("never replays an entry for a note an editor owns; it replays once the note is closed", async () => {
    const { acquireNoteOwnership } = await import("./note-ownership");
    setActiveSupabaseUser("u");
    let owned = false;
    const release = acquireNoteOwnership("v-own", () => { owned = true; });
    expect(owned).toBe(true);
    await enqueue(upd("v-own", "queued while open", 3));
    await processQueue();
    expect(mockedUpdate).not.toHaveBeenCalled();
    expect(await getQueueSize()).toBe(1);

    let done!: () => void;
    const released = new Promise<void>((r) => (done = r));
    release(async () => done());
    await released;
    await new Promise((r) => setTimeout(r, 0));
    await processQueue();
    expect(mockedUpdate).toHaveBeenCalledTimes(1);
    expect(await getQueueSize()).toBe(0);
  });

  it("replayQueuedFor sends just that note's entries, through the CAS", async () => {
    const { replayQueuedFor } = await import("./offline-queue");
    setActiveSupabaseUser("u");
    await enqueue(upd("v-a", "a text", 2));
    await enqueue(upd("v-b", "b text", 5));
    mockedUpdate.mockClear();
    await replayQueuedFor("v-a");
    expect(mockedUpdate).toHaveBeenCalledTimes(1);
    expect(mockedUpdate.mock.calls[0][0]).toBe("v-a");
    expect(mockedUpdate.mock.calls[0][4]).toMatchObject({ baseVersion: 2 });
    expect(mockedUpdate.mock.calls[0][4]?.conflictCopy?.id).toBeTruthy();
    expect(await getQueueSize()).toBe(1); // v-b untouched
  });

  it("keeps an entry queued after the save started and rebases it onto the landed version", async () => {
    const { dropSupersededUpdates, getPendingContentByNote } = await import("./offline-queue");
    const startedAt = Date.now() - 1000;
    await enqueue(upd("v-7", "typed while the save was in flight", 4));
    await dropSupersededUpdates("v-7", { startedAt, startBase: 4, landedVersion: 5, content: "saved" });
    expect((await getPendingContentByNote()).get("v-7")).toMatchObject({
      content: "typed while the save was in flight",
      baseVersion: 5,
    });
  });
});

async function allOps(): Promise<{ payload: { noteId: string; type: string } }[]> {
  const { OFFLINE_QUEUE_DB_NAME, OFFLINE_QUEUE_DB_VERSION, OFFLINE_QUEUE_STORE_NAME } = await import(
    "@/constants/app"
  );
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(OFFLINE_QUEUE_DB_NAME, OFFLINE_QUEUE_DB_VERSION);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  const ops = await new Promise<any[]>((resolve, reject) => {
    const req = db.transaction(OFFLINE_QUEUE_STORE_NAME, "readonly").objectStore(OFFLINE_QUEUE_STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return ops;
}

describe("dropUpdatesQueuedSince — an edit undone after its save failed (real IDB)", () => {
  beforeEach(() => setActiveSupabaseUser("u"));
  it("drops this tab's updates queued since the confirmed save, and nothing else", async () => {
    const { dropUpdatesQueuedSince, getPendingContentByNote, queueClock } = await import("./offline-queue");
    await enqueue(upd("u-1", "before the confirmed save", 3)); // older: not ours to judge
    const confirmedAt = queueClock(); // the confirmed save started here
    await enqueue(upd("u-1", "saved text + typo (failed save)", 4));
    await enqueue(upd("u-1", "saved text + more typo (failed retry)", 4)); // replaces the one above
    await enqueue(upd("u-other", "another note", 4));
    await putForeignOp({
      id: "op_foreign_u1",
      payload: upd("u-1", "typed in another tab", 4),
      timestamp: Date.now() + 1000,
      retryCount: 0,
      lastAttempt: null,
      origin: OTHER_TAB,
    });
    await enqueue({ type: "updateTitle", noteId: "u-1", source: "supabase", userId: "u", title: "t" });

    expect(await dropUpdatesQueuedSince("u-1", confirmedAt)).toBe(1);

    const left = await allOps();
    const u1 = left.filter((o) => o.payload.noteId === "u-1");
    expect(u1.map((o) => (o.payload as { content?: string; title?: string }).content ?? o.payload.type).sort()).toEqual(
      ["before the confirmed save", "typed in another tab", "updateTitle"].sort(),
    );
    expect((await getPendingContentByNote()).get("u-other")?.content).toBe("another note");
  });

  it("is a no-op when nothing was queued since", async () => {
    const { dropUpdatesQueuedSince, queueClock } = await import("./offline-queue");
    await enqueue(upd("u-2", "older", 3));
    expect(await dropUpdatesQueuedSince("u-2", queueClock())).toBe(0);
    expect(await getQueueSize()).toBe(1);
  });
});

