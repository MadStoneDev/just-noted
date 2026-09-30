import { describe, it, expect } from "vitest";
import {
  PLANS,
  COMPARISON_ROWS,
  downgradeEffects,
  autosaveTrimCount,
  isUnlimited,
} from "@/lib/plans";
import { getLimits } from "@/lib/subscription";
import {
  resolveRetentionDays,
  recoverableUntilMs,
  DRAFT_RETENTION_DAYS,
  SCRIBE_RETENTION_OPTIONS,
} from "@/lib/retention";

const DAY = 86400000;

// The config is the single source of truth; these lock in the values that every
// enforcement path (notebooks, collaborators, version caps, retention) reads.
describe("PLANS — enforced values", () => {
  it("Draft caps", () => {
    const d = PLANS.draft;
    expect(d.limits.maxNotes).toBe(-1); // unlimited
    expect(d.limits.maxNotebooks).toBe(10);
    expect(d.limits.maxEditCollaborators).toBe(0);
    expect(d.limits.autosaveVersionCap).toBe(50);
    expect(d.retention.trashDays).toBe(30);
    expect(d.retention.trashOptions).toEqual([]);
    expect(d.features.editCollaboration).toBe(false);
    expect(d.features.versionHistoryRangeFilter).toBe(false);
    expect(d.price.display).toBe("Free");
  });

  it("Scribe caps", () => {
    const s = PLANS.scribe;
    expect(s.limits.maxNotes).toBe(-1);
    expect(isUnlimited(s.limits.maxNotebooks)).toBe(true);
    expect(isUnlimited(s.limits.maxEditCollaborators)).toBe(true);
    expect(s.limits.autosaveVersionCap).toBe(200);
    expect(s.retention.trashDays).toBe(60);
    expect(s.retention.trashOptions).toEqual([60, 90]);
    expect(s.features.editCollaboration).toBe(true);
    expect(s.features.versionHistoryRangeFilter).toBe(true);
    expect(s.price.display).toBe("A$5/month");
    expect(s.price.gstNote).toBeTruthy(); // "no GST" note present
  });
});

describe("getLimits — derives from PLANS", () => {
  it("Draft", () => {
    const l = getLimits("draft");
    expect(l.maxCollaborators).toBe(0);
    expect(l.canCollaborate).toBe(false);
    expect(l.maxVersionHistory).toBe(50);
    expect(l.canExportAll).toBe(true);
    expect(l.canUseTemplates).toBe(true);
  });
  it("Scribe", () => {
    const l = getLimits("scribe");
    expect(l.maxCollaborators).toBe(-1);
    expect(l.canCollaborate).toBe(true);
    expect(l.maxVersionHistory).toBe(200);
  });
});

describe("COMPARISON_ROWS — generated from the config (pricing & Plan & Usage share it)", () => {
  const row = (label: string) => COMPARISON_ROWS.find((r) => r.label === label)!;

  it("notebooks", () => {
    expect(row("Notebooks").draft).toBe("10 notebooks");
    expect(row("Notebooks").scribe).toBe("Unlimited");
  });
  it("edit collaboration is a boolean gate", () => {
    expect(row("Share to edit (live collaboration)").draft).toBe(false);
    expect(row("Share to edit (live collaboration)").scribe).toBe(true);
  });
  it("version history reflects the caps", () => {
    expect(row("Version history").draft).toBe("50 per note");
    expect(row("Version history").scribe).toBe("200 per note");
  });
  it("date filter is a Scribe-only boolean", () => {
    expect(row("Version history date filter").draft).toBe(false);
    expect(row("Version history date filter").scribe).toBe(true);
  });
});

describe("downgradeEffects — numbers come from the Draft config", () => {
  it("mentions the notebook cap, version cap and retention window", () => {
    const text = downgradeEffects().join(" ");
    expect(text).toContain(String(PLANS.draft.limits.maxNotebooks)); // 10
    expect(text).toContain(String(PLANS.draft.limits.autosaveVersionCap)); // 50
    expect(text).toContain(String(PLANS.draft.retention.trashDays)); // 30
    expect(text.toLowerCase()).toContain("nothing is deleted");
    expect(text.toLowerCase()).toContain("view-only");
  });
});

describe("autosaveTrimCount — version cap (50 Draft / 200 Scribe)", () => {
  it("Draft cap 50", () => {
    expect(autosaveTrimCount(49, 50)).toBe(0); // below cap → keep all
    expect(autosaveTrimCount(50, 50)).toBe(1); // at cap → drop 1, insert 1 = 50
    expect(autosaveTrimCount(52, 50)).toBe(3); // over cap (e.g. after downgrade) → settle to 50
  });
  it("Scribe cap 200", () => {
    expect(autosaveTrimCount(199, 200)).toBe(0);
    expect(autosaveTrimCount(200, 200)).toBe(1);
    expect(autosaveTrimCount(250, 200)).toBe(51);
  });
});

describe("resolveRetentionDays — per plan", () => {
  it("Draft is fixed at 30", () => {
    expect(resolveRetentionDays("draft")).toBe(DRAFT_RETENTION_DAYS);
    expect(resolveRetentionDays("draft", 90)).toBe(30); // pref ignored for Draft
  });
  it("Scribe honours a valid preference, else defaults to 60", () => {
    expect(resolveRetentionDays("scribe", 90)).toBe(90);
    expect(resolveRetentionDays("scribe", 60)).toBe(60);
    expect(resolveRetentionDays("scribe", 45)).toBe(60); // invalid → default
    expect(resolveRetentionDays("scribe", null)).toBe(60);
    expect(SCRIBE_RETENTION_OPTIONS).toEqual([60, 90]);
  });
});

describe("recoverableUntilMs — downgrade trash grace clamp", () => {
  const now = Date.now();

  it("no grace: window measured from deletedAt", () => {
    const deleted = now - 10 * DAY;
    expect(recoverableUntilMs(deleted, 0, 30)).toBe(deleted + 30 * DAY);
  });

  it("grace keeps a note trashed under a longer Scribe window recoverable", () => {
    // Trashed 40 days ago under Scribe (90d), downgraded 5 days ago, now on 30d.
    const deleted = now - 40 * DAY;
    const downgrade = now - 5 * DAY;
    const until = recoverableUntilMs(deleted, downgrade, 30);
    // Measured from the downgrade date → still ~25 days of recovery left.
    expect(until).toBe(downgrade + 30 * DAY);
    expect(until).toBeGreaterThan(now); // still recoverable, not purged early
  });

  it("post-downgrade trash uses the normal 30-day window", () => {
    // Trashed 2 days after downgrade → deletedAt is the later anchor.
    const downgrade = now - 10 * DAY;
    const deleted = now - 8 * DAY;
    expect(recoverableUntilMs(deleted, downgrade, 30)).toBe(deleted + 30 * DAY);
  });
});
