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
  isPinned: false,
  isPrivate: false,
  deletedAt: undefined,
  ...o,
});

describe("reconcileNotes (reload reconciliation)", () => {
  it("keeps a just-typed note's text when the server copy is still empty (signed-in reload persists)", () => {
    // The content edit hasn't durably reached the server yet, so the server row
    // is empty. On reload we must NOT show it empty.
    const server = [mk({ id: "a", content: "", updatedAt: NOW })];
    const local = [mk({ id: "a", content: "hello world", updatedAt: NOW })];

    const { merged, toPush } = reconcileNotes(server, local, NOW);

    expect(merged).toHaveLength(1);
    expect(merged[0].content).toBe("hello world");
    expect(toPush.map((n) => n.id)).toContain("a");
  });

  it("keeps a guest's local-only note that has content and was just created (guest reload persists)", () => {
    const server: any[] = [];
    const local = [mk({ id: "b", source: "redis", content: "my draft", createdAt: NOW - 1000 })];

    const { merged, toPush } = reconcileNotes(server, local, NOW);

    expect(merged.map((n) => n.id)).toEqual(["b"]);
    expect(toPush.map((n) => n.id)).toContain("b");
  });

  it("does not resurrect a note deleted locally but still present on the server", () => {
    const server = [mk({ id: "c", content: "text", updatedAt: NOW - 5000, deletedAt: undefined })];
    const local = [mk({ id: "c", content: "text", updatedAt: NOW, deletedAt: NOW })];

    const { merged, toPush, toDelete } = reconcileNotes(server, local, NOW);

    // Kept as a tombstone (filtered from view by deletedAt), never re-pushed,
    // and the server delete is scheduled to finish.
    expect(merged[0].deletedAt).toBe(NOW);
    expect(toPush.map((n) => n.id)).not.toContain("c");
    expect(toDelete.map((n) => n.id)).toContain("c");
  });

  it("drops a local-only tombstone instead of re-creating it", () => {
    const server: any[] = [];
    const local = [mk({ id: "d", content: "gone", createdAt: NOW, deletedAt: NOW })];

    const { merged, toPush } = reconcileNotes(server, local, NOW);

    expect(merged).toHaveLength(0);
    expect(toPush).toHaveLength(0);
  });

  it("lets the server win when it has content and is newer (no spurious push)", () => {
    const server = [mk({ id: "e", content: "server version", updatedAt: NOW })];
    const local = [mk({ id: "e", content: "stale local", updatedAt: NOW - 5000 })];

    const { merged, toPush } = reconcileNotes(server, local, NOW);

    expect(merged[0].content).toBe("server version");
    expect(toPush).toHaveLength(0);
  });

  it("lets a strictly-newer local edit win and pushes it", () => {
    const server = [mk({ id: "f", content: "old", updatedAt: NOW - 5000 })];
    const local = [mk({ id: "f", content: "new edit", updatedAt: NOW })];

    const { merged, toPush } = reconcileNotes(server, local, NOW);

    expect(merged[0].content).toBe("new edit");
    expect(toPush.map((n) => n.id)).toContain("f");
  });
});
