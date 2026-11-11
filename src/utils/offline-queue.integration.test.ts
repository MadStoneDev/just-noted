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

describe("migrateUntaggedCloudOps — legacy backfill (real IDB)", () => {
  it("backfills untagged cloud ops so they flush under the current account", async () => {
    await enqueue({
      type: "update",
      noteId: "legacy1",
      source: "supabase",
      userId: "", // legacy op with no account tag
      content: "x",
      goal: 0,
      goalType: "",
    });

    // Before migration: signed in as userA, the untagged op is skipped by the guard.
    setActiveSupabaseUser("userA");
    await processQueue();
    expect(mockedUpdate).not.toHaveBeenCalled();
    expect(await getQueueSize()).toBe(1);

    // One-time migration tags it with the current user; now it flushes.
    const fixed = await migrateUntaggedCloudOps("userA");
    expect(fixed).toBe(1);
    await processQueue();
    expect(mockedUpdate).toHaveBeenCalledWith("legacy1", "x", 0, "", { allowLegacy: true });
    expect(await getQueueSize()).toBe(0);
  });

  it("is a no-op with no active user, and leaves already-tagged ops alone", async () => {
    await cloudUpdate("tagged1", "userA");
    expect(await migrateUntaggedCloudOps(null)).toBe(0);
    expect(await migrateUntaggedCloudOps("userB")).toBe(0); // tagged1 already has userA
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

  it("an entry from an older build (no base) keeps the legacy path", async () => {
    setActiveSupabaseUser("u");
    await enqueue(upd("v-2", "legacy text"));
    await processQueue();
    expect(mockedUpdate.mock.calls[0][4]).toEqual({ allowLegacy: true });
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

  it("a successful save never drops another tab's queued edit", async () => {
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
    expect(await getQueueSize()).toBe(1);
  });

  it("drops this tab's older entry from the same base, keeps one from an older base", async () => {
    const { dropSupersededUpdates, getPendingContentByNote } = await import("./offline-queue");
    await enqueue(upd("v-5", "earlier draft", 4));
    await enqueue(upd("v-6", "text from before adopting v7", 4));
    const startedAt = Date.now();
    await dropSupersededUpdates("v-5", { startedAt, startBase: 4, landedVersion: 5, content: "final" });
    await dropSupersededUpdates("v-6", { startedAt, startBase: 7, landedVersion: 8, content: "final" });
    const pending = await getPendingContentByNote();
    expect(pending.has("v-5")).toBe(false);
    expect(pending.get("v-6")?.content).toBe("text from before adopting v7");
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
