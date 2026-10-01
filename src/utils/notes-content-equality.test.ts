import { describe, it, expect } from "vitest";
import { normalizeNoteContent, sameNoteContent } from "./notes-utils";

describe("sameNoteContent (server save no-op)", () => {
  it("treats CRLF and LF line endings as equal", () => {
    expect(sameNoteContent("# Hi\r\n\r\nBody", "# Hi\n\nBody")).toBe(true);
  });

  it("ignores trailing whitespace / blank lines at the end of the document", () => {
    expect(sameNoteContent("Body text", "Body text\n\n")).toBe(true);
    expect(sameNoteContent("Body text", "Body text   ")).toBe(true);
  });

  it("treats equal content as equal", () => {
    const s = "# Heading\n\nSome **bold** and `code`.";
    expect(sameNoteContent(s, s)).toBe(true);
  });

  it("does NOT equate a genuine edit (must still save)", () => {
    expect(sameNoteContent("Body text", "Body text!")).toBe(false);
    expect(sameNoteContent("- a\n- b", "- a\n- b\n- c")).toBe(false);
  });

  it("does NOT strip leading whitespace (could be a real edit or code indent)", () => {
    expect(sameNoteContent("x", "    x")).toBe(false);
  });

  it("treats null/undefined/empty as equal", () => {
    expect(sameNoteContent(null, "")).toBe(true);
    expect(sameNoteContent(undefined, "   ")).toBe(true);
  });

  it("normalizeNoteContent is idempotent", () => {
    const once = normalizeNoteContent("# Hi\r\n\r\n");
    expect(normalizeNoteContent(once)).toBe(once);
  });
});
