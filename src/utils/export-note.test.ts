// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { toHtml, toMarkdown, toPlainText } from "./export-note";

// Exports keep intentional empty lines, so the file matches what the user wrote.
const note = {
  title: "T",
  content: "a\n\n&nbsp;\n\n&nbsp;\n\nb\n\n```\n&nbsp;\n```\n",
  contentFormat: "markdown" as const,
};

describe("exports keep intentional empty lines", () => {
  it("Markdown: `&nbsp;` lines as written", () => {
    expect(toMarkdown(note)).toBe(note.content);
  });

  it("HTML: each empty line is an &nbsp; paragraph", () => {
    const html = toHtml(note);
    expect(html.match(/<p>&nbsp;<\/p>/g)).toHaveLength(2);
    expect(html).toContain("<code>&amp;nbsp;\n</code>");
  });

  it("TXT: each empty line is truly empty (no non-breaking space)", () => {
    const txt = toPlainText(note);
    expect(txt).not.toMatch(/^ $/m);
    expect(txt.startsWith("a\n")).toBe(true);
    // a, then two empty-line paragraphs, then b: the gap keeps both lines.
    expect(txt).toMatch(/^a\n+\n\n+b\n/);
    expect(txt).toContain("&nbsp;"); // the code block's literal text is kept
  });
});
