import { describe, it, expect } from "vitest";
import { cloneNote, type CombinedNote } from "./combined-notes";

const base = (over: Partial<CombinedNote>): CombinedNote => ({
  id: "n1",
  author: "",
  title: "T",
  content: "c",
  isPinned: false,
  isPrivate: false,
  isCollapsed: false,
  order: 0,
  createdAt: 1,
  updatedAt: 1,
  source: "redis",
  contentFormat: "markdown",
  version: 1,
  ...over,
});

describe("cloneNote preserves storage (salvage keeps local local / cloud cloud)", () => {
  it("keeps source = redis for a local note", () => {
    const copy = cloneNote(base({ source: "redis" }));
    expect(copy.source).toBe("redis");
  });

  it("keeps source = supabase for a cloud note", () => {
    const copy = cloneNote(base({ source: "supabase" }));
    expect(copy.source).toBe("supabase");
  });

  it("is a distinct object (mutating the copy doesn't touch the original)", () => {
    const orig = base({ content: "orig" });
    const copy = cloneNote(orig);
    copy.content = "changed";
    expect(orig.content).toBe("orig");
  });
});
