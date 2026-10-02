import { describe, it, expect } from "vitest";
import { parseTags, hasOgTags } from "./og-parse";

const HTML = `<!doctype html><html><head>
  <title>Best Coffee &amp; Tea</title>
  <meta name="description" content="A guide to great cafés.">
  <meta property="og:title" content="Best Coffee in Brisbane">
  <meta property="og:description" content='Where to drink well.'>
  <meta property="og:image" content="https://ex.com/card.png">
  <meta property="og:title" content="DUPLICATE SHOULD BE IGNORED">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="canonical" href="https://ex.com/coffee">
</head><body><p>…</p></body></html>`;

describe("parseTags (spec §8.3)", () => {
  const t = parseTags(HTML);
  it("reads title with entity decoding", () => {
    expect(t.title).toBe("Best Coffee & Tea");
  });
  it("reads meta description", () => {
    expect(t.description).toBe("A guide to great cafés.");
  });
  it("reads og tags, first value wins on duplicates", () => {
    expect(t.og["og:title"]).toBe("Best Coffee in Brisbane");
    expect(t.og["og:description"]).toBe("Where to drink well.");
    expect(t.og["og:image"]).toBe("https://ex.com/card.png");
  });
  it("reads twitter tags and canonical", () => {
    expect(t.twitter["twitter:card"]).toBe("summary_large_image");
    expect(t.canonical).toBe("https://ex.com/coffee");
  });
  it("collects raw tags as found", () => {
    expect(t.raw.some((r) => r.property === "og:title" && r.content === "Best Coffee in Brisbane")).toBe(true);
    expect(t.raw.find((r) => r.property === "title")?.content).toBe("Best Coffee & Tea");
  });
  it("hasOgTags", () => {
    expect(hasOgTags(t)).toBe(true);
    expect(hasOgTags(parseTags("<html><head><title>x</title></head></html>"))).toBe(false);
  });
  it("handles single-quoted, unquoted and reversed attribute order", () => {
    const r = parseTags(`<meta content=summary name=twitter:card>`);
    expect(r.twitter["twitter:card"]).toBe("summary");
  });
});
