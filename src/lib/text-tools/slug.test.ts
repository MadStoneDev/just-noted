import { describe, it, expect } from "vitest";
import { slugify, slugifyLines } from "./slug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("strips accents", () => {
    expect(slugify("Crème Brûlée")).toBe("creme-brulee");
    expect(slugify("naïve café")).toBe("naive-cafe");
  });

  it("turns & into 'and'", () => {
    expect(slugify("Cats & Dogs")).toBe("cats-and-dogs");
  });

  it("removes apostrophes (straight and curly)", () => {
    expect(slugify("Don't Stop")).toBe("dont-stop");
    expect(slugify("Don’t Stop")).toBe("dont-stop");
  });

  it("collapses and trims hyphens", () => {
    expect(slugify("  --Hello---World--  ")).toBe("hello-world");
    expect(slugify("a / b / c")).toBe("a-b-c");
  });

  it("drops emoji to hyphens and trims", () => {
    expect(slugify("Hello 😀 World")).toBe("hello-world");
    expect(slugify("🚀🚀 Launch")).toBe("launch");
  });

  it("handles empty / symbol-only input", () => {
    expect(slugify("")).toBe("");
    expect(slugify("   ")).toBe("");
    expect(slugify("@#$%")).toBe("");
  });

  it("removes filler words only when asked", () => {
    expect(slugify("The Story of a Girl")).toBe("the-story-of-a-girl");
    expect(slugify("The Story of a Girl", { removeFillerWords: true })).toBe("story-girl");
  });

  it("drops 'and' (incl. from &) when removing filler words", () => {
    expect(slugify("Cats & Dogs", { removeFillerWords: true })).toBe("cats-dogs");
  });

  it("cuts at a word boundary within maxLength", () => {
    expect(slugify("the quick brown fox", { maxLength: 12 })).toBe("the-quick");
    // first word already longer than max -> hard cut
    expect(slugify("internationalisation", { maxLength: 6 })).toBe("intern");
  });

  it("returns the whole slug when under maxLength", () => {
    expect(slugify("short title", { maxLength: 50 })).toBe("short-title");
  });
});

describe("slugifyLines (batch)", () => {
  it("maps one title per line to one slug per line, keeping blanks", () => {
    expect(slugifyLines("First Post\n\nSecond & Third")).toBe("first-post\n\nsecond-and-third");
  });
});
