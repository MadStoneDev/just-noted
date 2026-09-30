import { describe, it, expect } from "vitest";
import { wouldBlankNonEmpty } from "@/lib/collab-guard";

describe("wouldBlankNonEmpty — the projection must never blank a non-empty note", () => {
  it("blocks empty/whitespace over existing content", () => {
    expect(wouldBlankNonEmpty("", "real content")).toBe(true);
    expect(wouldBlankNonEmpty("   \n  ", "real content")).toBe(true);
    expect(wouldBlankNonEmpty(null, "real content")).toBe(true);
    expect(wouldBlankNonEmpty(undefined, "real content")).toBe(true);
  });

  it("allows a real edit", () => {
    expect(wouldBlankNonEmpty("new text", "old text")).toBe(false);
  });

  it("allows clearing when the note was already empty (nothing to protect)", () => {
    expect(wouldBlankNonEmpty("", "")).toBe(false);
    expect(wouldBlankNonEmpty("", "   ")).toBe(false);
    expect(wouldBlankNonEmpty("", null)).toBe(false);
  });

  it("allows writing content into an empty note", () => {
    expect(wouldBlankNonEmpty("hello", "")).toBe(false);
  });
});
