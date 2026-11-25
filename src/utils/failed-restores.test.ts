// A guest note whose Undo failed is kept in IndexedDB until it's restored or
// explicitly discarded (fake-indexeddb).
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";
import {
  saveFailedRestore,
  removeFailedRestore,
  listFailedRestores,
  resetFailedRestoresDBHandle,
} from "./failed-restores";
import type { CombinedNote } from "@/types/combined-notes";

const note = (id: string, content = "kept text"): CombinedNote =>
  ({ id, title: `T ${id}`, content, source: "redis", deletedAt: 123 }) as unknown as CombinedNote;

beforeEach(() => {
  (globalThis as any).indexedDB = new IDBFactory();
  resetFailedRestoresDBHandle();
});

describe("failed restores", () => {
  it("keeps the snapshot (live, not a tombstone) for its owner", async () => {
    await saveFailedRestore(note("a"), "guest-1");
    const kept = await listFailedRestores("guest-1");
    expect(kept).toHaveLength(1);
    expect(kept[0].note.content).toBe("kept text");
    expect(kept[0].note.deletedAt).toBeNull();
    expect(await listFailedRestores("guest-2")).toEqual([]);
  });

  it("survives a reload (a fresh connection reads it back)", async () => {
    await saveFailedRestore(note("a"), "guest-1");
    resetFailedRestoresDBHandle();
    expect((await listFailedRestores("guest-1")).map((e) => e.id)).toEqual(["a"]);
  });

  it("is dropped only when removed (restored or discarded)", async () => {
    await saveFailedRestore(note("a"), "guest-1");
    await saveFailedRestore(note("b"), "guest-1");
    await removeFailedRestore("a");
    expect((await listFailedRestores("guest-1")).map((e) => e.id)).toEqual(["b"]);
  });

  it("a second failure of the same note replaces, not duplicates", async () => {
    await saveFailedRestore(note("a", "v1"), "guest-1");
    await saveFailedRestore(note("a", "v2"), "guest-1");
    const kept = await listFailedRestores("guest-1");
    expect(kept).toHaveLength(1);
    expect(kept[0].note.content).toBe("v2");
  });
});
