import type { SupabaseClient } from "@supabase/supabase-js";
import type { SubscriptionTier, SubscriptionLimits } from "@/types/subscription";
import { PLANS } from "@/lib/plans";

/**
 * Resolve a user's active subscription tier. A subscription only counts when its
 * status is active/trialing; anything else (cancelled, past_due, none) is free.
 */
export async function getUserTier(
  supabase: SupabaseClient,
  userId: string,
): Promise<SubscriptionTier> {
  if (!userId) return "draft";
  const { data } = await supabase
    .from("subscriptions")
    .select("tier, status")
    .eq("user_id", userId)
    .maybeSingle();
  const status = (data as any)?.status;
  const tier = (data as any)?.tier as string | undefined;
  if ((status === "active" || status === "trialing") && tier === "scribe") {
    return "scribe";
  }
  return "draft";
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
