import { describe, it, expect } from "vitest";
import {
  countGraphemes,
  countCharactersNoSpaces,
  countSentences,
  countParagraphs,
  splitSentences,
  readingSeconds,
  speakingSeconds,
  formatDuration,
} from "./counts";
import { extractKeywords } from "./keywords";

describe("countGraphemes / countCharactersNoSpaces (spec §8.1)", () => {
  it("counts code points / graphemes", () => {
    expect(countGraphemes("")).toBe(0);
    expect(countGraphemes("hello")).toBe(5);
  });
  it("without-spaces excludes all whitespace", () => {
    expect(countCharactersNoSpaces("a b\tc\nd")).toBe(4);
    expect(countCharactersNoSpaces("  hello  world  ")).toBe(10);
  });
});

describe("countSentences (spec §8.1)", () => {
  it("splits on . ! ? followed by whitespace or end", () => {
    expect(countSentences("One. Two! Three?")).toBe(3);
    expect(countSentences("Hello world")).toBe(1); // unterminated still counts
    expect(countSentences("")).toBe(0);
    expect(countSentences("   ")).toBe(0);
  });
  it("ignores abbreviations and decimals", () => {
    expect(countSentences("Dr. Smith went home.")).toBe(1);
    expect(countSentences("Use e.g. apples and i.e. oranges.")).toBe(1);
    expect(countSentences("Pi is 3.14 exactly.")).toBe(1);
    expect(countSentences("Meet at 9 a.m. tomorrow.")).toBe(1);
  });
  it("splitSentences restores masked dots", () => {
    expect(splitSentences("Pi is 3.14. Done.")).toEqual(["Pi is 3.14", " Done"]);
  });
});

describe("countParagraphs (spec §8.1)", () => {
  it("separates on one or more blank lines, not single breaks", () => {
    expect(countParagraphs("a\nb\nc")).toBe(1);
    expect(countParagraphs("one\n\ntwo")).toBe(2);
    expect(countParagraphs("one\n\n\n\ntwo")).toBe(2);
    expect(countParagraphs("one\n  \ntwo")).toBe(2); // whitespace-only line
    expect(countParagraphs("")).toBe(0);
  });
});

describe("durations (spec §8.1)", () => {
  it("reading/speaking at 238 / 130 wpm", () => {
    expect(formatDuration(readingSeconds(121))).toBe("31s");
    expect(formatDuration(speakingSeconds(121))).toBe("56s");
  });
  it("formats <60s, <60min, and hours", () => {
    expect(formatDuration(31)).toBe("31s");
    expect(formatDuration(59)).toBe("59s");
    expect(formatDuration(240)).toBe("4 min");
    expect(formatDuration(3600)).toBe("1 h");
    expect(formatDuration(4320)).toBe("1 h 12 min");
  });
});

describe("extractKeywords (spec §8.1)", () => {
  it("counts single words, lowercased, excluding stopwords by default", () => {
    const rows = extractKeywords("The cat sat on the cat mat. The cat ran.");
    expect(rows[0]).toMatchObject({ term: "cat", count: 3 });
    expect(rows.find((r) => r.term === "the")).toBeUndefined();
  });
  it("keeps stopwords when exclude is off", () => {
    const rows = extractKeywords("the the the cat", { excludeCommon: false });
    expect(rows[0]).toMatchObject({ term: "the", count: 3 });
  });
  it("2-word phrases never span a sentence boundary", () => {
    const rows = extractKeywords("red house. house red.", { phraseLen: 2 });
    // "house red" and "red house" each once; never "house house" across the dot
    expect(rows.find((r) => r.term === "red house")).toMatchObject({ count: 1 });
    expect(rows.find((r) => r.term === "house red")).toMatchObject({ count: 1 });
  });
  it("excludes a phrase only if it starts or ends with a stopword", () => {
    const rows = extractKeywords("state of the art design is an art", { phraseLen: 3, excludeCommon: true });
    // "state of the" ends ok? starts "state", ends "the" -> excluded
    expect(rows.find((r) => r.term === "state of the")).toBeUndefined();
    // "of the art" starts with stopword -> excluded
    expect(rows.find((r) => r.term === "of the art")).toBeUndefined();
  });
  it("percentage is relative to total words, one decimal", () => {
    const rows = extractKeywords("cat cat dog dog", { excludeCommon: false });
    expect(rows[0].pct).toBe(50);
  });
  it("empty text yields no rows", () => {
    expect(extractKeywords("")).toEqual([]);
  });
  it("excludes pure-number single tokens (even with exclude off)", () => {
    const on = extractKeywords("I paid 3.50 and 3.50 again for coffee.", { phraseLen: 1, excludeCommon: true });
    expect(on.find((r) => r.term === "3.50")).toBeUndefined();
    const off = extractKeywords("3.50 3.50 coffee", { phraseLen: 1, excludeCommon: false });
    expect(off.find((r) => r.term === "3.50")).toBeUndefined();
    expect(off.find((r) => r.term === "coffee")).toBeDefined();
  });
  it("excludes phrases that start or end with a number when exclude is on", () => {
    const rows = extractKeywords("buy 3 apples. apples cost 3.", { phraseLen: 2, excludeCommon: true });
    expect(rows.find((r) => r.term === "3 apples")).toBeUndefined();
    expect(rows.find((r) => r.term === "apples cost")).toBeDefined();
  });
});
