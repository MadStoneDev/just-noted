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

// Local copies in these tests are text this device typed and hasn't confirmed
// (CombinedNote.localEdit) — the only kind reconcile may push or copy.
const typed = (notes: any[]): any[] => notes.map((n) => ({ localEdit: NOW, ...n }));

describe("reconcileNotes — version-based (clock-independent)", () => {
  it("keeps a just-typed note's text when the server copy is still empty", () => {
    const server = [mk({ id: "a", content: "", version: 1 })];
    const local = [mk({ id: "a", content: "hello world", version: 1 })];
    const { merged, toPush } = reconcileNotes(server, typed(local), NOW);
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
    const { merged, toDelete, toPush } = reconcileNotes(server, typed(local), NOW);
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
    const { merged, toConflictCopy } = reconcileNotes(server, typed(local), NOW);
    expect(merged[0].content).toBe("server version");
    expect(toConflictCopy.map((n) => n.content)).toContain("my unsynced text");
  });

  it("server ahead but content identical after normalisation → no conflicted copy", () => {
    // Stale baseVersion (server moved from 3 to 5) yet the bodies are the same
    // once line endings / trailing whitespace are ignored — a spurious conflict.
    // It must take the server copy and create NO "(conflicted copy)".
    const server = [mk({ id: "e2", content: "Same body\n\ntext", version: 5 })];
    const local = [mk({ id: "e2", content: "Same body\r\n\r\ntext\n", version: 3 })];
    const { merged, toConflictCopy } = reconcileNotes(server, typed(local), NOW);
    expect(merged[0].content).toBe("Same body\n\ntext");
    expect(toConflictCopy).toHaveLength(0);
  });

  describe("opening a note never spawns a conflicted copy (semantic suppression)", () => {
    it("server ahead, same words but stored as Markdown vs the owner's HTML → no copy", () => {
      // A collaborator merely OPENING an editable share re-saves the owner's note
      // as Markdown (version bumps). The owner's cached copy is still the original
      // HTML. Bytes and format differ, but not a single word changed, so this must
      // take the server copy and create NO "(conflicted copy)".
      const server = [mk({ id: "o1", content: "Hello world", contentFormat: "markdown", version: 5 })];
      const local = [mk({ id: "o1", content: "<p>Hello world</p>", contentFormat: "html", version: 3 })];
      const { merged, toConflictCopy } = reconcileNotes(server, typed(local), NOW);
      expect(merged[0].content).toBe("Hello world");
      expect(toConflictCopy).toHaveLength(0);
    });

    it("server ahead, Markdown re-serialised (bullet markers changed) → no copy", () => {
      const server = [mk({ id: "o2", content: "- a\n- b", contentFormat: "markdown", version: 5 })];
      const local = [mk({ id: "o2", content: "* a\n* b", contentFormat: "markdown", version: 3 })];
      const { merged, toConflictCopy } = reconcileNotes(server, typed(local), NOW);
      expect(merged[0].content).toBe("- a\n- b");
      expect(toConflictCopy).toHaveLength(0);
    });

    it("server ahead, SAME words but a word was newly bolded → copy still made", () => {
      // A genuine formatting edit is real divergence: the plain text matches but
      // the formatting fingerprint differs, so the owner's copy must be preserved.
      const server = [mk({ id: "o3", content: "Hello **world**", contentFormat: "markdown", version: 5 })];
      const local = [mk({ id: "o3", content: "Hello world", contentFormat: "markdown", version: 3 })];
      const { merged, toConflictCopy } = reconcileNotes(server, typed(local), NOW);
      expect(merged[0].content).toBe("Hello **world**");
      expect(toConflictCopy.map((n) => n.content)).toContain("Hello world");
    });

    it("server ahead with genuinely different words → copy still made", () => {
      const server = [mk({ id: "o4", content: "a whole new paragraph", contentFormat: "markdown", version: 5 })];
      const local = [mk({ id: "o4", content: "the original text", contentFormat: "markdown", version: 3 })];
      const { toConflictCopy } = reconcileNotes(server, typed(local), NOW);
      expect(toConflictCopy.map((n) => n.content)).toContain("the original text");
    });
  });

  it("user typed during sync + server has a newer version → both preserved", () => {
    // The editor-lock change allows editing cached content during initial sync.
    // If that edit (local, still at the version it loaded from) meets a newer
    // server version, reconcile must keep the server copy AND preserve the user's
    // text as a conflicted copy — never silently drop either side.
    const server = [mk({ id: "z", content: "newer server text", version: 7 })];
    const local = [mk({ id: "z", content: "text I typed during sync", version: 4 })];
    const { merged, toConflictCopy } = reconcileNotes(server, typed(local), NOW);
    expect(merged[0].content).toBe("newer server text");
    expect(toConflictCopy.map((n) => n.content)).toContain("text I typed during sync");
  });

  it("local version AHEAD of the server (server not at our base) → copy, never an overwrite", () => {
    // The local version only ever comes from the server, so a server behind it
    // isn't the base this text was edited on (e.g. a restored note).
    const server = [mk({ id: "f", content: "old", version: 2 })];
    const local = [mk({ id: "f", content: "new offline edit", version: 3 })];
    const { merged, toPush, toConflictCopy } = reconcileNotes(server, typed(local), NOW);
    expect(merged[0].content).toBe("old");
    expect(toPush).toHaveLength(0);
    expect(toConflictCopy.map((n) => n.content)).toEqual(["new offline edit"]);
  });

  it("same version + differing content = unsynced local edit → keep & push (no conflict copy)", () => {
    const server = [mk({ id: "g", content: "server", version: 4 })];
    const local = [mk({ id: "g", content: "local unsynced", version: 4 })];
    const { merged, toPush, toConflictCopy } = reconcileNotes(server, typed(local), NOW);
    expect(merged[0].content).toBe("local unsynced");
    expect(toPush.map((n) => n.id)).toContain("g");
    expect(toConflictCopy).toHaveLength(0);
  });

  it("same version + same content → take server, no push", () => {
    const server = [mk({ id: "h", content: "same", version: 4 })];
    const local = [mk({ id: "h", content: "same", version: 4 })];
    const { toPush, toConflictCopy } = reconcileNotes(server, typed(local), NOW);
    expect(toPush).toHaveLength(0);
    expect(toConflictCopy).toHaveLength(0);
  });

  describe("clock skew does not decide the winner", () => {
    it("device clock AHEAD: a far-future local timestamp does not beat a higher server version", () => {
      // Local looks 'newer' by time but its version is behind → server wins.
      const server = [mk({ id: "s", content: "server", version: 9, updatedAt: NOW - 100000 })];
      const local = [mk({ id: "s", content: "stale local", version: 4, updatedAt: NOW + 10_000_000 })];
      const { merged, toConflictCopy } = reconcileNotes(server, typed(local), NOW);
      expect(merged[0].content).toBe("server");
      expect(toConflictCopy.map((n) => n.content)).toContain("stale local");
    });

    it("device clock BEHIND: an old local timestamp still pushes when the server is at its base", () => {
      const server = [mk({ id: "s2", content: "server", version: 5, updatedAt: NOW })];
      const local = [mk({ id: "s2", content: "newer local", version: 5, updatedAt: NOW - 10_000_000 })];
      const { merged, toPush } = reconcileNotes(server, typed(local), NOW);
      expect(merged[0].content).toBe("newer local");
      expect(toPush.map((n) => n.id)).toContain("s2");
    });
  });
});

describe("reconcileNotes — load pushes use the background CAS decision", () => {
  it("server at base → push, carrying the base version for the CAS write", () => {
    const server = [mk({ id: "p1", content: "server", version: 4 })];
    const local = [mk({ id: "p1", content: "local edit", version: 4 })];
    const { toPush, toConflictCopy } = reconcileNotes(server, typed(local), NOW);
    expect(toPush.map((n) => [n.id, n.version])).toEqual([["p1", 4]]);
    expect(toConflictCopy).toHaveLength(0);
  });

  it("same text, different versions → nothing to push, no copy", () => {
    const server = [mk({ id: "p2", content: "same\n", version: 6 })];
    const local = [mk({ id: "p2", content: "same", version: 4 })];
    const { merged, toPush, toConflictCopy } = reconcileNotes(server, typed(local), NOW);
    expect(merged[0].version).toBe(6);
    expect(toPush).toHaveLength(0);
    expect(toConflictCopy).toHaveLength(0);
  });

  it("empty server copy that moved past our base → server kept, local text becomes the copy", () => {
    // Previously the empty-server safety net pushed over it whatever the
    // versions said. Now the text is still kept — as a copy, not an overwrite.
    const server = [mk({ id: "p3", content: "", version: 5 })];
    const local = [mk({ id: "p3", content: "my text", version: 3 })];
    const { merged, toPush, toConflictCopy } = reconcileNotes(server, typed(local), NOW);
    expect(merged[0].content).toBe("");
    expect(toPush).toHaveLength(0);
    expect(toConflictCopy.map((n) => n.content)).toEqual(["my text"]);
  });

  it("note deleted on the server at our same version → copy, never revived by a push", () => {
    const server = [mk({ id: "p4", content: "text", version: 4, deletedAt: NOW - 1000 })];
    const local = [mk({ id: "p4", content: "text plus my edit", version: 4 })];
    const { merged, toPush, toConflictCopy } = reconcileNotes(server, typed(local), NOW);
    expect(merged[0].deletedAt).toBe(NOW - 1000);
    expect(toPush).toHaveLength(0);
    expect(toConflictCopy.map((n) => n.content)).toEqual(["text plus my edit"]);
  });

  it("note deleted on the server with the same text → no copy", () => {
    const server = [mk({ id: "p5", content: "text", version: 5, deletedAt: NOW - 1000 })];
    const local = [mk({ id: "p5", content: "text", version: 4 })];
    const { toPush, toConflictCopy } = reconcileNotes(server, typed(local), NOW);
    expect(toPush).toHaveLength(0);
    expect(toConflictCopy).toHaveLength(0);
  });
});

describe("reconcileNotes — a stale cache is not an unsynced edit (two devices)", () => {
  it("takes the server copy, with no push and no copy, when the cached text was never typed here", () => {
    const server = [mk({ id: "s", content: "edited on the other device", version: 5 })];
    const local = [mk({ id: "s", content: "older synced text", version: 3 })]; // no localEdit
    const { merged, toPush, toConflictCopy } = reconcileNotes(server, local, NOW);
    expect(merged[0].content).toBe("edited on the other device");
    expect(toPush).toHaveLength(0);
    expect(toConflictCopy).toHaveLength(0);
  });
  it("same version, different text, no localEdit → server copy (nothing to push)", () => {
    const { merged, toPush } = reconcileNotes(
      [mk({ id: "t", content: "server", version: 2 })],
      [mk({ id: "t", content: "cache", version: 2 })],
      NOW,
    );
    expect(merged[0].content).toBe("server");
    expect(toPush).toHaveLength(0);
  });
  it("text typed here and unconfirmed still wins at the same base", () => {
    const { merged, toPush } = reconcileNotes(
      [mk({ id: "u", content: "server", version: 2 })],
      [mk({ id: "u", content: "typed here", version: 2, localEdit: NOW })],
      NOW,
    );
    expect(merged[0].content).toBe("typed here");
    expect(toPush.map((n) => n.id)).toEqual(["u"]);
  });
});

