import { describe, it, expect } from "vitest";
import { confirmMatchesEmail, purgeAtFrom, isPurgeDue, ACCOUNT_GRACE_DAYS } from "@/lib/account-deletion";

const DAY = 86400000;

describe("confirmMatchesEmail", () => {
  it("matches case-insensitively, ignoring surrounding space", () => {
    expect(confirmMatchesEmail("  Me@Example.com ", "me@example.com")).toBe(true);
  });
  it("rejects a mismatch or empty input", () => {
    expect(confirmMatchesEmail("other@example.com", "me@example.com")).toBe(false);
    expect(confirmMatchesEmail("", "me@example.com")).toBe(false);
    expect(confirmMatchesEmail("me@example.com", "")).toBe(false);
    expect(confirmMatchesEmail(null, null)).toBe(false);
  });
});

describe("purgeAtFrom / isPurgeDue", () => {
  it("schedules the purge a full grace window out", () => {
    const t = 1_000_000;
    expect(purgeAtFrom(t)).toBe(t + ACCOUNT_GRACE_DAYS * DAY);
  });
  it("is due only once the window has passed", () => {
    const now = Date.now();
    expect(isPurgeDue(now - 1, now)).toBe(true);
    expect(isPurgeDue(now, now)).toBe(true);
    expect(isPurgeDue(now + DAY, now)).toBe(false);
  });
});
