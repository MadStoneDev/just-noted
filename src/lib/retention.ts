// Trash retention policy — how long a soft-deleted note stays recoverable.
//
// Retention is enforced in two places that must agree:
//   1. The Trash view *hides* notes older than the user's window, so the
//      window takes effect immediately without waiting on any job.
//   2. A cron (see /api/admin/cleanup) *hard-deletes* rows past PHYSICAL_PURGE_DAYS.
//
// PHYSICAL_PURGE_DAYS sits just beyond the largest window a user can choose, so
// no tier or setting ever loses a note it should still be able to see, and
// nothing physically lingers much past ~3 months.

import type { SubscriptionTier } from "@/types/subscription";

export const DRAFT_RETENTION_DAYS = 30;
export const SCRIBE_RETENTION_OPTIONS = [60, 90] as const;
export const DEFAULT_SCRIBE_RETENTION_DAYS = 60;
export const PHYSICAL_PURGE_DAYS = 91;

export type ScribeRetentionDays = (typeof SCRIBE_RETENTION_OPTIONS)[number];

export function isScribeRetentionDays(n: unknown): n is ScribeRetentionDays {
  return (SCRIBE_RETENTION_OPTIONS as readonly number[]).includes(n as number);
}

/**
 * The retention window (in days) the user's Trash should honour. Draft is fixed
 * at 30; Scribe honours the stored preference (60 or 90), defaulting to 60.
 */
export function resolveRetentionDays(
  tier: SubscriptionTier,
  scribePref?: number | null,
): number {
  if (tier === "scribe") {
    return isScribeRetentionDays(scribePref)
      ? scribePref
      : DEFAULT_SCRIBE_RETENTION_DAYS;
  }
  return DRAFT_RETENTION_DAYS;
}
