import { describe, it, expect } from "vitest";
import { decodeHtmlEntities, stripContentToText, getPlainTextPreview } from "./html-utils";
import { getNotePreview } from "@/components/notes/note-card";

const RAW = /&(?:#x?[0-9a-f]+|[a-z]+);/i;

describe("decodeHtmlEntities", () => {
  it("decodes named, decimal and hex references", () => {
    expect(decodeHtmlEntities("a&nbsp;b &amp; c &lt;d&gt; &quot;e&quot; &#39;f&#x27; it&rsquo;s &mdash;")).toBe(
      "a b & c <d> \"e\" 'f' it’s —",
    );
    expect(decodeHtmlEntities("&#160;&#xA0;x")).toBe("  x");
  });
  it("decodes once (no double-unescape)", () => {
    expect(decodeHtmlEntities("&amp;lt;")).toBe("&lt;");
  });
  it("leaves unknown or invalid references as written", () => {
    expect(decodeHtmlEntities("&notareal; &#xD800; AT&T")).toBe("&notareal; &#xD800; AT&T");
  });
});

describe("previews and search text have no raw entities", () => {
  it("markdown content", () => {
    const md = "Fish&nbsp;&amp;&nbsp;chips &#8212; Tom&#39;s &lt;list&gt;";
    const text = stripContentToText(md, "markdown");
    expect(text).toBe("Fish & chips — Tom's <list>");
    expect(text).not.toMatch(RAW);
  });
  it("html content", () => {
    const html = "<p>Fish&nbsp;&amp;&nbsp;chips</p><p>Tom&#x27;s &hellip;</p>";
    expect(stripContentToText(html, "html")).toBe("Fish & chips Tom's …");
  });
  it("escaped markup stays as text, not a tag", () => {
    expect(stripContentToText("&lt;b&gt;bold&lt;/b&gt;", "markdown")).toBe("<b>bold</b>");
  });
  it("sidebar note card preview", () => {
    expect(getNotePreview("Hello&nbsp;world &amp; more")).toBe("Hello world & more");
    expect(getPlainTextPreview("a&nbsp;&nbsp;b", 200, "markdown")).toBe("a b");
  });
});
