// The cache's localEdit mark against a real IndexedDB (fake-indexeddb): only
// text typed on this device and not yet confirmed by a landed save may count
// as unsynced — a merely stale cached copy must never look like an edit.
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  saveNoteToLocal,
  saveAllNotesToLocal,
  setLocalNoteVersion,
  getLocalNote,
  clearLocalNotes,
} from "./notes-idb-cache";

// The cache checks window.indexedDB; fake-indexeddb installs it on globalThis.
vi.stubGlobal("window", globalThis);

const note = (o: Record<string, unknown> = {}): any => ({
  id: "n1",
  title: "T",
  content: "synced text",
  contentFormat: "markdown",
  source: "supabase",
  createdAt: 1,
  updatedAt: 1,
  version: 2,
  isPinned: false,
  isPrivate: false,
  ...o,
});

beforeEach(async () => {
  await clearLocalNotes();
});

describe("IndexedDB cache — localEdit mark", () => {
  it("only an explicit local edit marks the cached copy", async () => {
    await saveNoteToLocal(note());
    expect((await getLocalNote("n1"))?.localEdit).toBeUndefined();
    await saveNoteToLocal(note({ content: "typed here" }), { localEdit: true });
    expect((await getLocalNote("n1"))?.localEdit).toBeGreaterThan(0);
  });

  it("a landed save carrying the cached text clears the mark and raises the version", async () => {
    await saveNoteToLocal(note({ content: "typed here" }), { localEdit: true });
    await setLocalNoteVersion("n1", 3, "typed here\n");
    const c = await getLocalNote("n1");
    expect(c?.version).toBe(3);
    expect(c?.localEdit).toBeUndefined();
  });

  it("a landed save of OLDER text keeps the mark (newer text was typed on top)", async () => {
    await saveNoteToLocal(note({ content: "typed here and more" }), { localEdit: true });
    await setLocalNoteVersion("n1", 3, "typed here");
    const c = await getLocalNote("n1");
    expect(c?.version).toBe(3);
    expect(c?.localEdit).toBeGreaterThan(0);
  });

  it("a store object can't carry a stale mark back into the cache", async () => {
    await saveNoteToLocal(note({ content: "now synced" }));
    // e.g. the store still holds the object painted from an older cache record
    await saveAllNotesToLocal([note({ content: "now synced", localEdit: 123 })]);
    expect((await getLocalNote("n1"))?.localEdit).toBeUndefined();
    await saveNoteToLocal(note({ content: "now synced", localEdit: 123 }));
    expect((await getLocalNote("n1"))?.localEdit).toBeUndefined();
  });

  it("a bulk refresh never replaces unconfirmed text with the server copy", async () => {
    await saveNoteToLocal(note({ content: "typed, not yet saved" }), { localEdit: true });
    await saveAllNotesToLocal([note({ content: "server copy" })]);
    const c = await getLocalNote("n1");
    expect(c?.content).toBe("typed, not yet saved");
    expect(c?.localEdit).toBeGreaterThan(0);
  });

  it("a bulk refresh with the same text keeps the mark until a save confirms it", async () => {
    await saveNoteToLocal(note({ content: "typed" }), { localEdit: true });
    await saveAllNotesToLocal([note({ content: "typed" })]);
    expect((await getLocalNote("n1"))?.localEdit).toBeGreaterThan(0);
  });
});
