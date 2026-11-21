import { describe, it, expect } from "vitest";
import { protectUnsyncedLocal, type PendingContent } from "./notes-merge";

const mk = (o: Record<string, unknown>): any => ({
  id: "x",
  title: "Note",
  content: "",
  contentFormat: "markdown",
  source: "redis",
  createdAt: 1,
  updatedAt: 1,
  version: 1,
  goal: 0,
  goal_type: "",
  isPinned: false,
  isPrivate: false,
  deletedAt: undefined,
  ...o,
});
const pend = (entries: Record<string, string>) =>
  new Map<string, PendingContent>(
    Object.entries(entries).map(([id, content]) => [id, { content, goal: 0, goalType: "" }]),
  );

// Cached copies here are text this device typed and hasn't confirmed.
const typed = (o: Record<string, unknown>) => mk({ localEdit: 1, ...o });

describe("protectUnsyncedLocal — refresh never clobbers unsynced local edits", () => {
  it("keeps queued content over a stale server copy and asks for a drain", () => {
    const server = [mk({ id: "a", content: "old", version: 3 })];
    const r = protectUnsyncedLocal(server, [], pend({ a: "old + typed before close" }));
    expect(r.notes[0].content).toBe("old + typed before close");
    expect(r.notes[0].version).toBe(3); // base unchanged; the queue push bumps it
    expect(r.fromQueue).toEqual(["a"]);
    expect(r.toPush).toEqual([]);
  });

  it("server moved past the queued edit's base: server copy shown, drain makes the copy", () => {
    const server = [mk({ id: "a", content: "other device", version: 9 })];
    const local = [mk({ id: "a", content: "stale cache", version: 2 })];
    const pending = new Map<string, PendingContent>([
      ["a", { content: "queued", goal: 0, goalType: "", baseVersion: 2 }],
    ]);
    const r = protectUnsyncedLocal(server, local, pending);
    expect(r.notes[0]).toBe(server[0]); // the newer remote edit is never hidden
    expect(r.fromQueue).toEqual(["a"]); // the replay saves "queued" as a copy
  });

  it("server still at the queued edit's base: queued text shown and drained", () => {
    const server = [mk({ id: "a", content: "old", version: 2 })];
    const pending = new Map<string, PendingContent>([
      ["a", { content: "old + typed", goal: 0, goalType: "", baseVersion: 2 }],
    ]);
    const r = protectUnsyncedLocal(server, [], pending);
    expect(r.notes[0].content).toBe("old + typed");
    expect(r.fromQueue).toEqual(["a"]);
  });

  it("a legacy queued entry (no base) still overlays, as before", () => {
    const server = [mk({ id: "a", content: "other device", version: 9 })];
    const r = protectUnsyncedLocal(server, [], pend({ a: "queued" }));
    expect(r.notes[0].content).toBe("queued");
  });

  it("ignores a queue entry the server already has", () => {
    const server = [mk({ id: "a", content: "same\n", version: 4 })];
    const r = protectUnsyncedLocal(server, [], pend({ a: "same" }));
    expect(r.notes[0]).toBe(server[0]);
    expect(r.fromQueue).toEqual([]);
  });

  it("keeps and pushes a newer cached edit at the same base version", () => {
    const server = [mk({ id: "a", content: "before", version: 2 })];
    const local = [typed({ id: "a", content: "before and after", version: 2 })];
    const r = protectUnsyncedLocal(server, local, new Map());
    expect(r.notes[0].content).toBe("before and after");
    expect(r.toPush.map((n) => n.id)).toEqual(["a"]);
  });

  it("lets a genuinely newer server version win over an older cache", () => {
    const server = [mk({ id: "a", content: "edited elsewhere", version: 5 })];
    const local = [mk({ id: "a", content: "old cache", version: 4 })];
    const r = protectUnsyncedLocal(server, local, new Map());
    expect(r.notes[0].content).toBe("edited elsewhere");
    expect(r.toPush).toEqual([]);
  });

  it("takes the server copy when nothing differs", () => {
    const server = [mk({ id: "a", content: "x", version: 1 })];
    const r = protectUnsyncedLocal(server, [mk({ id: "a", content: "x" })], new Map());
    expect(r.notes[0]).toBe(server[0]);
  });

  it("never revives a local tombstone or blanks server text from an empty cache", () => {
    const server = [mk({ id: "a", content: "text", version: 1 }), mk({ id: "b", content: "keep" })];
    const local = [
      mk({ id: "a", content: "changed", deletedAt: 5 }),
      mk({ id: "b", content: "" }),
    ];
    const r = protectUnsyncedLocal(server, local, new Map());
    expect(r.notes.map((n) => n.content)).toEqual(["text", "keep"]);
    expect(r.toPush).toEqual([]);
  });

  it("does not add local-only notes (deleted elsewhere stays deleted)", () => {
    const r = protectUnsyncedLocal([], [mk({ id: "gone", content: "x" })], pend({ gone: "y" }));
    expect(r.notes).toEqual([]);
  });
});

describe("protectUnsyncedLocal — notes an editor owns", () => {
  it("never pushes or substitutes an owned note's cached text; it takes the server copy", () => {
    const server = [mk({ id: "o1", content: "server text", version: 4 })];
    const local = [typed({ id: "o1", content: "editor write-ahead (newer)", version: 4 })];
    const owned = protectUnsyncedLocal(server, local, new Map(), new Set(["o1"]));
    expect(owned.toPush).toEqual([]);
    expect(owned.notes[0].content).toBe("server text");
    // Same inputs, not owned: the cached text is protected and pushed, as before.
    const free = protectUnsyncedLocal(server, local, new Map());
    expect(free.toPush.map((n) => n.id)).toEqual(["o1"]);
  });
});

