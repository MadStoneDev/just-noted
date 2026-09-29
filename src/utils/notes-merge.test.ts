import { describe, it, expect } from "vitest";
import { reconcileNotes } from "./notes-merge";

const NOW = 1_700_000_000_000;

// Minimal note factory — only the fields reconcileNotes reads matter.
const mk = (o: Record<string, unknown>): any => ({
  id: "x",
  title: "New Note #1",
  content: "",
  source: "supabase",
  createdAt: NOW,
  updatedAt: NOW,
  version: 1,
  isPinned: false,
  isPrivate: false,
  deletedAt: undefined,
  ...o,
});

describe("reconcileNotes — version-based (clock-independent)", () => {
  it("keeps a just-typed note's text when the server copy is still empty", () => {
    const server = [mk({ id: "a", content: "", version: 1 })];
    const local = [mk({ id: "a", content: "hello world", version: 1 })];
    const { merged, toPush } = reconcileNotes(server, local, NOW);
    expect(merged[0].content).toBe("hello world");
    expect(toPush.map((n) => n.id)).toContain("a");
  });

  it("keeps a guest's local-only note that has content and was just created", () => {
    const { merged, toPush } = reconcileNotes(
      [],
      [mk({ id: "b", source: "redis", content: "my draft", createdAt: NOW - 1000 })],
      NOW,
    );
    expect(merged.map((n) => n.id)).toEqual(["b"]);
    expect(toPush.map((n) => n.id)).toContain("b");
  });

  it("does not resurrect a note deleted locally but still on the server", () => {
    const server = [mk({ id: "c", content: "text", version: 3, deletedAt: undefined })];
    const local = [mk({ id: "c", content: "text", version: 3, deletedAt: NOW })];
    const { merged, toDelete, toPush } = reconcileNotes(server, local, NOW);
    expect(merged[0].deletedAt).toBe(NOW);
    expect(toDelete.map((n) => n.id)).toContain("c");
    expect(toPush.map((n) => n.id)).not.toContain("c");
  });

  it("drops a local-only tombstone instead of re-creating it", () => {
    const { merged, toPush } = reconcileNotes(
      [],
      [mk({ id: "d", content: "gone", createdAt: NOW, deletedAt: NOW })],
      NOW,
    );
    expect(merged).toHaveLength(0);
    expect(toPush).toHaveLength(0);
  });

  it("takes the server copy when its version is ahead, and preserves differing local text as a conflicted copy", () => {
    const server = [mk({ id: "e", content: "server version", version: 5 })];
    const local = [mk({ id: "e", content: "my unsynced text", version: 3 })];
    const { merged, toConflictCopy } = reconcileNotes(server, local, NOW);
    expect(merged[0].content).toBe("server version");
    expect(toConflictCopy.map((n) => n.content)).toContain("my unsynced text");
  });

  it("keeps a strictly-newer local version and pushes it", () => {
    const server = [mk({ id: "f", content: "old", version: 2 })];
    const local = [mk({ id: "f", content: "new offline edit", version: 3 })];
    const { merged, toPush } = reconcileNotes(server, local, NOW);
    expect(merged[0].content).toBe("new offline edit");
    expect(toPush.map((n) => n.id)).toContain("f");
  });

  it("same version + differing content = unsynced local edit → keep & push (no conflict copy)", () => {
    const server = [mk({ id: "g", content: "server", version: 4 })];
    const local = [mk({ id: "g", content: "local unsynced", version: 4 })];
    const { merged, toPush, toConflictCopy } = reconcileNotes(server, local, NOW);
    expect(merged[0].content).toBe("local unsynced");
    expect(toPush.map((n) => n.id)).toContain("g");
    expect(toConflictCopy).toHaveLength(0);
  });

  it("same version + same content → take server, no push", () => {
    const server = [mk({ id: "h", content: "same", version: 4 })];
    const local = [mk({ id: "h", content: "same", version: 4 })];
    const { toPush, toConflictCopy } = reconcileNotes(server, local, NOW);
    expect(toPush).toHaveLength(0);
    expect(toConflictCopy).toHaveLength(0);
  });

  describe("clock skew does not decide the winner", () => {
    it("device clock AHEAD: a far-future local timestamp does not beat a higher server version", () => {
      // Local looks 'newer' by time but its version is behind → server wins.
      const server = [mk({ id: "s", content: "server", version: 9, updatedAt: NOW - 100000 })];
      const local = [mk({ id: "s", content: "stale local", version: 4, updatedAt: NOW + 10_000_000 })];
      const { merged, toConflictCopy } = reconcileNotes(server, local, NOW);
      expect(merged[0].content).toBe("server");
      expect(toConflictCopy.map((n) => n.content)).toContain("stale local");
    });

    it("device clock BEHIND: an old local timestamp still wins when its version is ahead", () => {
      const server = [mk({ id: "s2", content: "server", version: 2, updatedAt: NOW })];
      const local = [mk({ id: "s2", content: "newer local", version: 5, updatedAt: NOW - 10_000_000 })];
      const { merged, toPush } = reconcileNotes(server, local, NOW);
      expect(merged[0].content).toBe("newer local");
      expect(toPush.map((n) => n.id)).toContain("s2");
    });
  });
});
