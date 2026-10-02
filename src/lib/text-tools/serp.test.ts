import { describe, it, expect } from "vitest";
import { fitSingleLine, wrapToLines, overflowChars, overflowCharsWrapped, cutTail } from "./serp";

// Deterministic fake measurer: one unit per character (ellipsis = 1 unit).
const measure = (s: string) => s.length;

describe("fitSingleLine (spec §8.2)", () => {
  it("returns the text untouched when it fits", () => {
    expect(fitSingleLine("short title", 20, measure)).toEqual({ visible: "short title", truncated: false });
  });
  it("truncates at the last whole word that fits with an ellipsis", () => {
    // maxWidth 10 → "one two" (7) + "…" = 8 fits; adding " three" would be 13+1
    expect(fitSingleLine("one two three four", 10, measure)).toEqual({ visible: "one two", truncated: true });
  });
  it("hard-trims a single over-long word", () => {
    const r = fitSingleLine("supercalifragilistic", 6, measure);
    expect(r.truncated).toBe(true);
    expect(r.visible.length).toBe(5); // 5 chars + "…" = 6
  });
  it("collapses whitespace", () => {
    expect(fitSingleLine("  a   b  ", 50, measure)).toEqual({ visible: "a b", truncated: false });
  });
});

describe("wrapToLines (spec §8.2)", () => {
  it("wraps within a line budget without truncating", () => {
    const r = wrapToLines("aaa bbb ccc", 7, 2, measure);
    expect(r).toEqual({ lines: ["aaa bbb", "ccc"], truncated: false });
  });
  it("clamps to maxLines and ellipsises the last line", () => {
    const r = wrapToLines("aaa bbb ccc ddd eee", 7, 2, measure);
    expect(r.lines.length).toBe(2);
    expect(r.truncated).toBe(true);
    // last line ellipsised to fit "<=7" including the ellipsis
    expect(measure(`${r.lines[1]}…`)).toBeLessThanOrEqual(7);
  });
  it("empty text yields no lines", () => {
    expect(wrapToLines("", 10, 2, measure)).toEqual({ lines: [], truncated: false });
  });
});

describe("overflow helpers", () => {
  it("overflowChars counts characters to drop to fit one line", () => {
    expect(overflowChars("abcdefghij", 6, measure)).toBe(4); // keep 6, drop 4
    expect(overflowChars("abc", 10, measure)).toBe(0);
  });
  it("overflowCharsWrapped is 0 when it fits in the line budget", () => {
    expect(overflowCharsWrapped("aaa bbb", 7, 2, measure)).toBe(0);
    expect(overflowCharsWrapped("aaa bbb ccc ddd eee", 7, 2, measure)).toBeGreaterThan(0);
  });
});

describe("cutTail", () => {
  it("prefixes an ellipsis to the tail of the visible text", () => {
    expect(cutTail("Best coffee in 2026 | Just", 15)).toBe("…in 2026 | Just");
  });
});
