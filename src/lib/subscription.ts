import type { SupabaseClient } from "@supabase/supabase-js";
import type { SubscriptionTier, SubscriptionLimits } from "@/types/subscription";
import { PLANS } from "@/lib/plans";

export type PlanSource = "stripe" | "manual";
export type BillingState = "ok" | "manual" | "billing_issue";

export interface SubscriptionRow {
  tier?: string | null;
  status?: string | null;
  plan_source?: string | null;
  comp_until?: string | null;
}

/**
 * Resolve the effective tier from a subscription row. Pure (no I/O) so it's the
 * one place the rules live and can be unit-tested.
 *
 * - manual (comped/admin grant): Scribe as long as the comp window hasn't
 *   passed. There's no Stripe status to check; comp_until (if set) bounds it —
 *   once it's in the past the account falls back to the free tier at read time,
 *   so no cron is needed.
 * - stripe (default): Scribe only while status is active/trialing. Anything else
 *   (cancelled, past_due, none) is free.
 */
export function resolvePlanTier(
  row: SubscriptionRow | null | undefined,
  now: number = Date.now(),
): SubscriptionTier {
  if (!row) return "draft";
  if (row.plan_source === "manual") {
    const compExpired = row.comp_until
      ? new Date(row.comp_until).getTime() <= now
      : false;
    return row.tier === "scribe" && !compExpired ? "scribe" : "draft";
  }
  return (row.status === "active" || row.status === "trialing") && row.tier === "scribe"
    ? "scribe"
    : "draft";
}

/**
 * The billing-management state for a paid account, so the UI never shows a
 * "Manage billing" button that can only fail. Pure and testable.
 */
export function billingStateFor(opts: {
  isPaid: boolean;
  planSource: string | null | undefined;
  hasStripeCustomer: boolean;
}): BillingState {
  if (!opts.isPaid) return "ok";
  if (opts.planSource === "manual") return "manual";
  if (!opts.hasStripeCustomer) return "billing_issue";
  return "ok";
}

/**
 * Resolve a user's active subscription tier. Reads the row and applies the plan
 * rules (Stripe status / manual comp window) via resolvePlanTier.
 */
export async function getUserTier(
  supabase: SupabaseClient,
  userId: string,
): Promise<SubscriptionTier> {
  if (!userId) return "draft";
  const { data } = await supabase
    .from("subscriptions")
    .select("tier, status, plan_source, comp_until")
    .eq("user_id", userId)
    .maybeSingle();
  return resolvePlanTier(data as SubscriptionRow | null);
}

export function getLimits(tier: SubscriptionTier): SubscriptionLimits {
  const plan = PLANS[tier];
  return {
    maxNotes: plan.limits.maxNotes,
    maxCollaborators: plan.limits.maxEditCollaborators,
    canExportAll: plan.features.export,
    canUseTemplates: plan.features.templates,
    maxVersionHistory: plan.limits.autosaveVersionCap,
    canCollaborate: plan.features.editCollaboration,
  };
}

/** Convenience for the collaboration gate. */
export async function getCollabAllowance(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ tier: SubscriptionTier; canCollaborate: boolean; maxCollaborators: number }> {
  const tier = await getUserTier(supabase, userId);
  const limits = getLimits(tier);
  return { tier, canCollaborate: limits.canCollaborate, maxCollaborators: limits.maxCollaborators };
}

/**
 * Whether a note's OWNER may currently have people edit it — i.e. their active
 * plan includes edit collaboration. This is the enforce-at-read gate for
 * downgrade: a lapsed Scribe's editors keep their `edit` rows (reversible) but
 * every edit *write* path checks this so they're view-only until the owner is
 * Scribe again. Call it from each write gate (shared-note save, Yjs doc
 * persistence), not just where editors are added.
 */
export async function ownerCanCollaborate(
  supabase: SupabaseClient,
  noteId: string,
): Promise<boolean> {
  if (!noteId) return false;
  const { data } = await supabase
    .from("notes")
    .select("author")
    .eq("id", noteId)
    .maybeSingle();
  const ownerId = (data as any)?.author as string | undefined;
  if (!ownerId) return false;
  const { canCollaborate } = await getCollabAllowance(supabase, ownerId);
  return canCollaborate;
}
