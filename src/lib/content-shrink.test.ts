import { describe, it, expect } from "vitest";
import { isMajorShrink, SHRINK_MIN_REMOVED } from "./content-shrink";

const s = (n: number) => "x".repeat(n);

describe("isMajorShrink (>50% shorter AND >200 chars removed)", () => {
  it("fires when both hold", () => {
    expect(isMajorShrink(s(1000), s(10))).toBe(true);
    expect(isMajorShrink(s(1000), "")).toBe(true);
    expect(isMajorShrink(s(402), s(200))).toBe(true); // 202 removed, 200 < 201
  });

  it("needs MORE than 200 removed", () => {
    expect(isMajorShrink(s(300), s(100))).toBe(false); // exactly 200 removed
    expect(isMajorShrink(s(301), s(100))).toBe(true); // 201 removed, 100 < 150.5
    expect(isMajorShrink(s(SHRINK_MIN_REMOVED + 10), "")).toBe(true);
    expect(isMajorShrink(s(150), "")).toBe(false); // short note emptied: normal editing
  });

  it("needs the result to be LESS than half", () => {
    expect(isMajorShrink(s(1000), s(500))).toBe(false); // exactly half
    expect(isMajorShrink(s(1000), s(499))).toBe(true);
    expect(isMajorShrink(s(1000), s(700))).toBe(false); // 300 removed but 70% kept
  });

  it("growth and no-ops never fire; nulls are empty; surrounding whitespace ignored", () => {
    expect(isMajorShrink(s(10), s(5000))).toBe(false);
    expect(isMajorShrink(s(800), s(800))).toBe(false);
    expect(isMajorShrink(null, s(10))).toBe(false);
    expect(isMajorShrink(s(1000), null)).toBe(true);
    expect(isMajorShrink(`${s(300)}${" ".repeat(500)}`, s(250))).toBe(false); // 300 → 250 after trim
  });
});
