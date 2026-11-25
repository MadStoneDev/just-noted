import { describe, expect, it } from "vitest";
import { blankEmptyLineMarkers, stripEmptyLineMarkers } from "./empty-line-marker";
import { htmlToMarkdown } from "./html-to-markdown";
import { countWordsInContent } from "./word-count";
import { stripMarkdownToText } from "./html-utils";

describe("stripEmptyLineMarkers", () => {
  it("removes marker lines (top level, in a list item, in a quote)", () => {
    expect(stripEmptyLineMarkers("a\n\n&nbsp;\n\n&nbsp;\n\nb\n")).toBe("a\n\n\n\nb\n");
    expect(stripEmptyLineMarkers("- one\n\n  &nbsp;\n- two\n")).toBe("- one\n\n- two\n");
    expect(stripEmptyLineMarkers("> a\n>\n> &nbsp;\n")).toBe("> a\n>\n");
  });

  it("keepLines turns each marker line into an empty line", () => {
    expect(stripEmptyLineMarkers("a\n\n&nbsp;\n\nb", { keepLines: true })).toBe("a\n\n\n\nb");
  });

  it("leaves code blocks, inline text and literal \\&nbsp; alone", () => {
    const code = "```\n&nbsp;\n```\n~~~\n&nbsp;\n~~~\n";
    expect(stripEmptyLineMarkers(code)).toBe(code);
    expect(stripEmptyLineMarkers("a&nbsp;b\n")).toBe("a&nbsp;b\n");
    expect(stripEmptyLineMarkers("\\&nbsp;\n")).toBe("\\&nbsp;\n");
  });

  it("previews, search text and word counts don't see the marker", () => {
    const md = "Hello world\n\n&nbsp;\n\n&nbsp;\n\nBye\n";
    expect(stripMarkdownToText(md)).toBe("Hello world Bye");
    expect(countWordsInContent(md)).toBe(3);
  });
});

describe("blankEmptyLineMarkers (TXT export)", () => {
  it("turns NBSP-only lines into truly empty lines", () => {
    expect(blankEmptyLineMarkers("a\n\u00a0\nb\n \u00a0 \nc")).toBe("a\n\nb\n\nc");
  });
  it("keeps a non-breaking space inside text", () => {
    expect(blankEmptyLineMarkers("a\u00a0b")).toBe("a\u00a0b");
  });
});

describe("htmlToMarkdown: empty paragraphs in old HTML notes", () => {
  it("<p>&nbsp;</p> → empty-line marker", () => {
    expect(htmlToMarkdown("<p>a</p><p>&nbsp;</p><p>b</p>")).toBe("a\n\n&nbsp;\n\nb");
  });
  it("<p><br></p> → empty-line marker, several in a row kept", () => {
    expect(htmlToMarkdown("<p>a</p><p><br></p><p><br></p><p>b</p>")).toBe("a\n\n&nbsp;\n\n&nbsp;\n\nb");
  });
  it("empty paragraphs at the very start or end are dropped, mid-note ones kept", () => {
    expect(htmlToMarkdown("<p></p><p><br></p><p>a</p><p></p><p>b</p><p><br></p>")).toBe("a\n\n&nbsp;\n\nb");
  });
  it("a paragraph holding only an image is content, not an empty line", () => {
    expect(htmlToMarkdown('<p><img src="x.png" alt="x"></p>')).toBe("![x](x.png)");
  });
});
