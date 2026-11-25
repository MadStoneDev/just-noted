import { describe, it, expect } from "vitest";
import { formatDate, formatDateTime, formatTime, formatWhen } from "./format-date";

// Local-time dates, so the assertions hold in any time zone.
const d = new Date(2026, 10, 26, 15, 45); // 26 Nov 2026, 3:45 pm

describe("app date format", () => {
  it("date: 26 Nov 2026", () => {
    expect(formatDate(d)).toBe("26 Nov 2026");
    expect(formatDate(new Date(2026, 8, 3))).toBe("3 Sep 2026");
    expect(formatDate(d.toISOString())).toBe("26 Nov 2026");
    expect(formatDate(d.getTime())).toBe("26 Nov 2026");
  });
  it("time: 3:45 pm, midnight and noon", () => {
    expect(formatTime(d)).toBe("3:45 pm");
    expect(formatTime(new Date(2026, 0, 1, 0, 5))).toBe("12:05 am");
    expect(formatTime(new Date(2026, 0, 1, 12, 0))).toBe("12:00 pm");
  });
  it("date and time: 26 Nov 2026, 3:45 pm", () => {
    expect(formatDateTime(d)).toBe("26 Nov 2026, 3:45 pm");
  });
  it("invalid input is empty, not 'Invalid Date'", () => {
    expect(formatDate("nope")).toBe("");
    expect(formatDateTime(NaN)).toBe("");
  });
  it("lists: relative within 24h, then the date", () => {
    const now = d.getTime();
    expect(formatWhen(now - 10_000, { now })).toBe("just now");
    expect(formatWhen(now - 5 * 60_000, { now })).toBe("5m ago");
    expect(formatWhen(now - 3 * 3_600_000, { now })).toBe("3h ago");
    const older = new Date(2026, 10, 20, 9, 5);
    expect(formatWhen(older, { now })).toBe("20 Nov 2026");
    expect(formatWhen(older, { now, time: true })).toBe("20 Nov 2026, 9:05 am");
  });
});
