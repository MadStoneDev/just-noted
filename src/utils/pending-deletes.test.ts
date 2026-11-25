// Ghost notes: a note deleted here must stay hidden — and receive no writes —
// until the server confirms the delete, including across a reload.
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

import type { CombinedNote } from "@/types/combined-notes";
import {
  hidePendingDeletes,
  settlePendingDeletes,
  markPendingDelete,
  clearPendingDelete,
  isPendingDelete,
  loadPendingDeletes,
  notePendingDeleteFromOtherTab,
  dropPendingDeleteHints,
  pendingDeletes,
  RESEND_GRACE_MS,
  __resetPendingDeletesForTests,
  type PendingDelete,
} from "./pending-deletes";
import { enqueue, enqueueContentNow, processQueue, clearQueue, getQueueSize, deleteAlreadyDone } from "./offline-queue";
import { setActiveSupabaseUser } from "./offline-queue-guard";
import { noteOperation } from "@/app/actions/notes";
import { useNotesStore } from "@/stores/notes-store";

const note = (id: string, extra: Partial<CombinedNote> = {}): CombinedNote =>
  ({
    id,
    title: id,
    content: `text ${id}`,
    source: "redis",
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...extra,
  }) as CombinedNote;

const entry = (id: string, extra: Partial<PendingDelete> = {}): PendingDelete => ({
  id,
  source: "redis",
  account: null,
  at: 0,
  ...extra,
});

async function resetAll() {
  for (const e of pendingDeletes()) await clearPendingDelete(e.id);
  __resetPendingDeletesForTests();
  await loadPendingDeletes();
  for (const e of pendingDeletes()) await clearPendingDelete(e.id);
}

beforeEach(async () => {
  vi.stubGlobal("navigator", { onLine: true });
  await resetAll();
  await clearQueue();
  setActiveSupabaseUser(null);
  vi.mocked(noteOperation).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("hidePendingDeletes", () => {
  it("keeps a pending note hidden though the server list has it live", () => {
    const out = hidePendingDeletes([note("a"), note("b")], new Set(["a"]), 42);
    expect(out.find((n) => n.id === "a")?.deletedAt).toBe(42);
    expect(out.find((n) => n.id === "b")?.deletedAt).toBeNull();
  });

  it("returns the same array when nothing is pending", () => {
    const list = [note("a")];
    expect(hidePendingDeletes(list, new Set())).toBe(list);
  });
});

describe("settlePendingDeletes", () => {
  const fetched = { redis: true, supabase: true };

  it("confirms a note the server no longer has, or has deleted", () => {
    const r = settlePendingDeletes(
      [entry("gone"), entry("trashed", { source: "supabase", account: "acc" })],
      [note("trashed", { source: "supabase", deletedAt: 5 })],
      fetched,
      "acc",
    );
    expect(r.confirmed.sort()).toEqual(["gone", "trashed"]);
    expect(r.resend).toEqual([]);
  });

  it("re-sends a delete the server still has live — only once it can't still be in flight", () => {
    const pending = [entry("a", { at: 1000 })];
    expect(settlePendingDeletes(pending, [note("a")], fetched, null, 1000 + 100).resend).toEqual([]);
    expect(settlePendingDeletes(pending, [note("a")], fetched, null, 1000 + RESEND_GRACE_MS).resend).toHaveLength(1);
    // After a reload nothing is in flight: grace 0.
    expect(settlePendingDeletes(pending, [note("a")], fetched, null, 1000, 0).resend).toHaveLength(1);
  });

  it("never judges a source whose fetch failed", () => {
    const r = settlePendingDeletes([entry("a")], [], { redis: false, supabase: true }, null);
    expect(r).toEqual({ confirmed: [], resend: [] });
  });

  it("judges a cloud delete only under the account that made it", () => {
    const pending = [entry("c", { source: "supabase", account: "acc1" })];
    // Signed in as another account: its list can't see acc1's notes.
    expect(settlePendingDeletes(pending, [], fetched, "acc2")).toEqual({ confirmed: [], resend: [] });
    expect(settlePendingDeletes(pending, [], fetched, null)).toEqual({ confirmed: [], resend: [] });
    expect(settlePendingDeletes(pending, [], fetched, "acc1").confirmed).toEqual(["c"]);
  });
});

describe("the pending set survives a reload (IndexedDB)", () => {
  it("a mark is still pending after the in-memory set is lost", async () => {
    await markPendingDelete(entry("a", { at: 7 }));
    __resetPendingDeletesForTests(); // the reload
    expect(isPendingDelete("a")).toBe(false);
    await loadPendingDeletes();
    expect(isPendingDelete("a")).toBe(true);
    expect(pendingDeletes()[0]).toMatchObject({ id: "a", at: 7 });
  });

  it("a clear sticks across a reload", async () => {
    await markPendingDelete(entry("a"));
    await clearPendingDelete("a");
    __resetPendingDeletesForTests();
    await loadPendingDeletes();
    expect(isPendingDelete("a")).toBe(false);
  });

  it("is pending at once, before the IndexedDB write lands, and a reload mid-write keeps it", async () => {
    const write = markPendingDelete(entry("a"));
    expect(isPendingDelete("a")).toBe(true);
    await loadPendingDeletes(); // races the write
    expect(isPendingDelete("a")).toBe(true);
    await write;
  });

  it("another tab's delete hides the note until that tab's record says otherwise", async () => {
    notePendingDeleteFromOtherTab("b");
    expect(isPendingDelete("b")).toBe(true);
    dropPendingDeleteHints(); // that tab undid it ("notes changed")
    expect(isPendingDelete("b")).toBe(false);
  });
});

describe("nothing is written to a pending-deleted note", () => {
  it("enqueue drops edits, titles and creates for it; its delete still queues", async () => {
    markPendingDelete(entry("a"));
    await enqueue({ type: "update", noteId: "a", source: "redis", userId: "u", content: "x", goal: 0, goalType: "" });
    await enqueue({ type: "updateTitle", noteId: "a", source: "redis", userId: "u", title: "t" });
    enqueueContentNow({ type: "update", noteId: "a", source: "redis", userId: "u", content: "y", goal: 0, goalType: "" });
    expect(await getQueueSize()).toBe(0);
    await enqueue({ type: "delete", noteId: "a", source: "redis", userId: "u" });
    expect(await getQueueSize()).toBe(1);
  });

  it("processQueue drops a queued edit for it (queued before the delete) and sends only the delete", async () => {
    await enqueue({ type: "update", noteId: "a", source: "redis", userId: "u", content: "x", goal: 0, goalType: "" });
    markPendingDelete(entry("a"));
    await processQueue();
    expect(await getQueueSize()).toBe(0);
    expect(vi.mocked(noteOperation)).not.toHaveBeenCalled();
  });

  it("a delete replay that finds the note already gone is done, not retried", async () => {
    vi.mocked(noteOperation).mockResolvedValueOnce({ success: false, error: "Note not found" } as never);
    await enqueue({ type: "delete", noteId: "a", source: "redis", userId: "u" });
    await processQueue();
    expect(await getQueueSize()).toBe(0);
    expect(deleteAlreadyDone({ success: false, error: "not_found" })).toBe(true);
    expect(deleteAlreadyDone({ success: false, error: "boom" })).toBe(false);
  });
});

describe("store commits keep pending deletes hidden", () => {
  it("mergeWithBackend / syncFromBackend keep the tombstone; setEditing ignores the note", () => {
    markPendingDelete(entry("a"));
    const s = useNotesStore.getState();
    s.syncFromBackend([note("a"), note("b")]);
    expect(useNotesStore.getState().notes.find((n) => n.id === "a")?.deletedAt).toBeTruthy();
    // With an in-flight edit elsewhere (the slower merge path) too.
    s.setEditing("b", true);
    s.mergeWithBackend([note("a"), note("b")]);
    expect(useNotesStore.getState().notes.find((n) => n.id === "a")?.deletedAt).toBeTruthy();
    s.setEditing("b", false);
    s.setEditing("a", true);
    expect(useNotesStore.getState().isEditing.has("a")).toBe(false);
  });

  it("reinstateNote brings a note back even after a refresh dropped its tombstone", () => {
    const s = useNotesStore.getState();
    s.syncFromBackend([note("b")]);
    s.reinstateNote(note("a", { deletedAt: 9, content: "latest" }));
    const a = useNotesStore.getState().notes.find((n) => n.id === "a");
    expect(a).toMatchObject({ deletedAt: null, content: "latest" });
  });
});
