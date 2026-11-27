import { describe, expect, it } from "vitest";
import { defaultRoadmapTab, nextTabIndex, panelIndexAt } from "./roadmap-tabs";

describe("defaultRoadmapTab", () => {
  it("opens on the preferred list when it has items", () => {
    expect(defaultRoadmapTab([1, 4, 2, 19], 2)).toBe(2);
  });
  it("falls back to the first list with items", () => {
    expect(defaultRoadmapTab([0, 3, 0, 5], 2)).toBe(1);
    expect(defaultRoadmapTab([0, 0, 0, 5], 2)).toBe(3);
  });
  it("keeps the preferred list when every list is empty", () => {
    expect(defaultRoadmapTab([0, 0, 0, 0], 2)).toBe(2);
    expect(defaultRoadmapTab([], 2)).toBe(2);
  });
});

describe("nextTabIndex", () => {
  it("moves with the arrows and wraps", () => {
    expect(nextTabIndex("ArrowRight", 0, 4)).toBe(1);
    expect(nextTabIndex("ArrowRight", 3, 4)).toBe(0);
    expect(nextTabIndex("ArrowLeft", 0, 4)).toBe(3);
    expect(nextTabIndex("ArrowLeft", 2, 4)).toBe(1);
  });
  it("jumps with Home / End", () => {
    expect(nextTabIndex("Home", 2, 4)).toBe(0);
    expect(nextTabIndex("End", 1, 4)).toBe(3);
  });
  it("ignores other keys", () => {
    expect(nextTabIndex("ArrowDown", 1, 4)).toBeNull();
    expect(nextTabIndex("Enter", 1, 4)).toBeNull();
  });
});

describe("panelIndexAt", () => {
  it("rounds to the nearest panel", () => {
    expect(panelIndexAt(0, 390, 4)).toBe(0);
    expect(panelIndexAt(190, 390, 4)).toBe(0);
    expect(panelIndexAt(200, 390, 4)).toBe(1);
    expect(panelIndexAt(780, 390, 4)).toBe(2);
  });
  it("clamps and tolerates a zero width", () => {
    expect(panelIndexAt(5000, 390, 4)).toBe(3);
    expect(panelIndexAt(-10, 390, 4)).toBe(0);
    expect(panelIndexAt(100, 0, 4)).toBe(0);
  });
});
