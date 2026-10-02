import { describe, it, expect } from "vitest";
import { slugify, slugifyDetailed, slugifyBatch } from "./slug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("strips accents", () => {
    expect(slugify("Crème Brûlée")).toBe("creme-brulee");
    expect(slugify("naïve café")).toBe("naive-cafe");
  });

  it("transliterates ligatures / special letters", () => {
    expect(slugify("Straße")).toBe("strasse");
    expect(slugify("Encyclopædia")).toBe("encyclopaedia");
    expect(slugify("Smørrebrød")).toBe("smorrebrod");
  });

  it("turns & into 'and'", () => {
    expect(slugify("Cats & Dogs")).toBe("cats-and-dogs");
  });

  it("removes apostrophes (straight and curly)", () => {
    expect(slugify("Don't Stop")).toBe("dont-stop");
    expect(slugify("Don’t Stop")).toBe("dont-stop");
  });

  it("collapses/trims hyphens and drops emoji", () => {
    expect(slugify("  --Hello---World--  ")).toBe("hello-world");
    expect(slugify("Hello 😀 World")).toBe("hello-world");
  });

  it("handles empty / symbol-only input", () => {
    expect(slugify("")).toBe("");
    expect(slugify("@#$%")).toBe("");
  });

  it("removes filler words only when asked, and never empties the slug", () => {
    expect(slugify("The Story of a Girl")).toBe("the-story-of-a-girl");
    expect(slugify("The Story of a Girl", { removeFillerWords: true })).toBe("story-girl");
    // all-filler title keeps everything rather than producing nothing
    expect(slugify("The And Of", { removeFillerWords: true })).toBe("the-and-of");
  });

  it("trims at a word boundary within maxLength", () => {
    expect(slugify("the quick brown fox", { maxLength: 12 })).toBe("the-quick");
    expect(slugify("internationalisation", { maxLength: 6 })).toBe("intern");
  });
});

describe("slugifyDetailed", () => {
  it("reports removed filler words in order, deduped", () => {
    const r = slugifyDetailed("The Cat and the Hat in the Box", { removeFillerWords: true });
    expect(r.slug).toBe("cat-hat-box");
    expect(r.removed).toEqual(["the", "and", "in"]);
  });

  it("flags trimming", () => {
    expect(slugifyDetailed("the quick brown fox", { maxLength: 12 }).trimmed).toBe(true);
    expect(slugifyDetailed("short", { maxLength: 60 }).trimmed).toBe(false);
  });

  it("no removed words when none are filler", () => {
    expect(slugifyDetailed("Quick Brown Fox", { removeFillerWords: true }).removed).toEqual([]);
  });
});

describe("slugifyBatch", () => {
  it("one slug per line, preserving blank lines", () => {
    const r = slugifyBatch("First Post\n\nSecond & Third");
    expect(r.outputs).toEqual(["first-post", "", "second-and-third"]);
    expect(r.titleCount).toBe(2);
    expect(r.slugCount).toBe(2);
  });

  it("suffixes duplicate slugs -2, -3…", () => {
    const r = slugifyBatch("Hello World\nHello World\nHello World");
    expect(r.outputs).toEqual(["hello-world", "hello-world-2", "hello-world-3"]);
    expect(r.duplicateCount).toBe(2);
  });

  it("keeps the duplicate suffix within maxLength", () => {
    const r = slugifyBatch("alpha beta\nalpha beta", { maxLength: 10 });
    expect(r.outputs[0]).toBe("alpha-beta");
    expect(r.outputs[1].length).toBeLessThanOrEqual(10);
    expect(r.outputs[1].endsWith("-2")).toBe(true);
  });

  it("first occurrence keeps its full slug when it exactly equals maxLength", () => {
    // Slug is exactly 60 chars; at max 60 the FIRST occurrence must not be trimmed.
    const title = "comprehensive guide choosing professional website developers";
    expect(slugify(title, { maxLength: 60 }).length).toBe(60);
    const r = slugifyBatch(`${title}\n${title}`, { maxLength: 60 });
    expect(r.outputs[0]).toBe("comprehensive-guide-choosing-professional-website-developers");
    expect(r.outputs[0].length).toBe(60);
    // Only the renamed duplicate is trimmed to fit its suffix within 60.
    expect(r.outputs[1].endsWith("-2")).toBe(true);
    expect(r.outputs[1].length).toBeLessThanOrEqual(60);
  });

  it("handles a double-digit duplicate suffix (-13)", () => {
    const r = slugifyBatch(Array.from({ length: 13 }, () => "Hello World").join("\n"));
    expect(r.outputs[0]).toBe("hello-world");
    expect(r.outputs[12]).toBe("hello-world-13");
    expect(r.duplicateCount).toBe(12);
  });

  it("caps at 1,000 lines", () => {
    const input = Array.from({ length: 1005 }, (_, i) => `Title ${i}`).join("\n");
    const r = slugifyBatch(input);
    expect(r.truncated).toBe(true);
    expect(r.outputs.length).toBe(1000);
  });
});
