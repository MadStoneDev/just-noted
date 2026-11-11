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

describe("protectUnsyncedLocal — refresh never clobbers unsynced local edits", () => {
  it("keeps queued content over a stale server copy and asks for a drain", () => {
    const server = [mk({ id: "a", content: "old", version: 3 })];
    const r = protectUnsyncedLocal(server, [], pend({ a: "old + typed before close" }));
    expect(r.notes[0].content).toBe("old + typed before close");
    expect(r.notes[0].version).toBe(3); // base unchanged; the queue push bumps it
    expect(r.fromQueue).toEqual(["a"]);
    expect(r.toPush).toEqual([]);
  });

  it("queued content wins even when the server moved on (the queue replays it)", () => {
    const server = [mk({ id: "a", content: "other device", version: 9 })];
    const local = [mk({ id: "a", content: "stale cache", version: 2 })];
    const r = protectUnsyncedLocal(server, local, pend({ a: "queued" }));
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
    const local = [mk({ id: "a", content: "before and after", version: 2 })];
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
