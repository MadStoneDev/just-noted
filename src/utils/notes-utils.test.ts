import { describe, it, expect } from "vitest";
import { sameAuthoredContent, sameNoteContent } from "./notes-utils";

describe("sameNoteContent (byte-strict no-op check)", () => {
  it("forgives line endings and trailing whitespace only", () => {
    expect(sameNoteContent("a\r\nb\n", "a\nb")).toBe(true);
    expect(sameNoteContent("a b", "a  b")).toBe(false); // interior whitespace matters
  });
});

describe("sameAuthoredContent (semantic, cross-format)", () => {
  it("equates the same words across HTML and Markdown", () => {
    expect(sameAuthoredContent("<p>Hello world</p>", "html", "Hello world", "markdown")).toBe(true);
  });

  it("equates a Markdown re-serialisation (bullet markers, trailing newline)", () => {
    expect(sameAuthoredContent("* a\n* b", "markdown", "- a\n- b\n", "markdown")).toBe(true);
  });

  it("equates the same headings/lists across formats", () => {
    const html = "<h1>Title</h1><ul><li>one</li><li>two</li></ul>";
    const md = "# Title\n\n- one\n- two";
    expect(sameAuthoredContent(html, "html", md, "markdown")).toBe(true);
  });

  it("does NOT equate when a word is newly bolded (same words, new formatting)", () => {
    expect(sameAuthoredContent("Hello world", "markdown", "Hello **world**", "markdown")).toBe(false);
  });

  it("does NOT equate when a link is added to the same words", () => {
    expect(sameAuthoredContent("see the docs", "markdown", "see the [docs](https://x.y)", "markdown")).toBe(false);
  });

  it("does NOT equate across formats when formatting differs", () => {
    expect(sameAuthoredContent("<p>Hello <strong>world</strong></p>", "html", "Hello world", "markdown")).toBe(false);
  });

  it("does NOT equate genuinely different words", () => {
    expect(sameAuthoredContent("the original", "markdown", "something else", "markdown")).toBe(false);
  });

  it("returns false for empty text (nothing to equate)", () => {
    expect(sameAuthoredContent("", "markdown", "", "markdown")).toBe(false);
    expect(sameAuthoredContent("<p></p>", "html", "", "markdown")).toBe(false);
  });
});
