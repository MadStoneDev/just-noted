import { describe, it, expect } from "vitest";
import { countWords, countCharacters, countLines } from "./counts";

describe("countWords (spec §5.3)", () => {
  it("counts runs of letters/digits", () => {
    expect(countWords("hello world")).toBe(2);
    expect(countWords("one two three")).toBe(3);
  });
  it("keeps internal apostrophes and hyphens as one word", () => {
    expect(countWords("don't")).toBe(1);
    expect(countWords("well-known")).toBe(1);
    expect(countWords("it’s a well-known fact")).toBe(4);
  });
  it("handles punctuation and empty", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
    expect(countWords("a, b; c.")).toBe(3);
    expect(countWords("2026 is year 1")).toBe(4);
  });
});

describe("countCharacters", () => {
  it("counts code points (emoji = 1)", () => {
    expect(countCharacters("abc")).toBe(3);
    expect(countCharacters("a😀b")).toBe(3);
  });
});

describe("countLines", () => {
  it("counts lines, empty string is 0", () => {
    expect(countLines("")).toBe(0);
    expect(countLines("one")).toBe(1);
    expect(countLines("one\ntwo\nthree")).toBe(3);
    expect(countLines("a\n\nb")).toBe(3);
  });
});

describe("countWords — internal separators (Word/Docs parity)", () => {
  it("keeps digit-group separators as one word", () => {
    expect(countWords("3.50")).toBe(1);
    expect(countWords("1,000")).toBe(1);
    expect(countWords("12:30")).toBe(1);
    expect(countWords("$3.50 for coffee")).toBe(3);
    expect(countWords("version 3.5.2 shipped")).toBe(3);
  });
  it("keeps dotted abbreviations as one word, drops a trailing dot", () => {
    expect(countWords("e.g.")).toBe(1);
    expect(countWords("i.e.")).toBe(1);
    expect(countWords("U.S.")).toBe(1);
    expect(countWords("Dr. Smith")).toBe(2);
  });
  it("does not merge letters across a comma (missing space)", () => {
    expect(countWords("Hello,world")).toBe(2);
  });
  it("matches the Word/Docs count on the sample paragraph (29)", () => {
    const text =
      "Dr. Smith paid $3.50 for coffee. It's well-known that e.g. cafés in Brisbane are great! Why don't we write more? SEO tips for small businesses help. SEO tips matter.";
    expect(countWords(text)).toBe(29);
  });
});
