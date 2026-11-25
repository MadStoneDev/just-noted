// Manual (comped/admin) Scribe grants. Kept apart from the "use server" admin
// file so it can be tested against an in-memory Supabase fake.
//
// A manual grant has no Stripe subscription: plan_source='manual', and
// stripe_subscription_id is cleared so a webhook event from some old
// subscription can never match (and downgrade) the row. The Stripe customer id
// is kept so a later real checkout reuses the same customer.

type Svc = { from: (table: string) => any };

export type ManualScribeResult = { success: boolean; error?: string };

const LIVE_STRIPE_STATUSES = ["active", "trialing", "past_due", "unpaid", "incomplete"];

export async function grantManualScribe(
  svc: Svc,
  userId: string,
  compUntil: string | null = null,
  now: Date = new Date(),
): Promise<ManualScribeResult> {
  const { data: existing } = await svc
    .from("subscriptions")
    .select("plan_source, status, stripe_subscription_id")
    .eq("user_id", userId)
    .maybeSingle();
  const row = existing as { plan_source?: string; status?: string; stripe_subscription_id?: string | null } | null;
  // Clearing a live subscription's id would leave the person billed with nothing
  // syncing their plan. Cancel it in Stripe first.
  if (
    row &&
    row.plan_source !== "manual" &&
    row.stripe_subscription_id &&
    LIVE_STRIPE_STATUSES.includes(row.status ?? "")
  ) {
    return {
      success: false,
      error: "This account has a live Stripe subscription — cancel it in Stripe before granting Scribe manually.",
    };
  }

  const { error } = await svc.from("subscriptions").upsert(
    {
      user_id: userId,
      tier: "scribe",
      status: "active",
      plan_source: "manual",
      comp_until: compUntil,
      stripe_subscription_id: null,
      updated_at: now.toISOString(),
    },
    { onConflict: "user_id" },
  );
  return error ? { success: false, error: error.message ?? "Couldn't save" } : { success: true };
}

/**
 * Remove a manual grant. Only touches a manual row: a Stripe subscriber's plan
 * follows their subscription and is changed in Stripe, never here.
 */
export async function revokeManualScribe(svc: Svc, userId: string, now: Date = new Date()): Promise<ManualScribeResult> {
  const { data: existing } = await svc
    .from("subscriptions")
    .select("plan_source")
    .eq("user_id", userId)
    .maybeSingle();
  const source = (existing as { plan_source?: string } | null)?.plan_source;
  if (!existing) return { success: true }; // no row = already Draft
  if (source !== "manual") {
    return { success: false, error: "This Scribe plan is billed through Stripe — cancel it in Stripe instead." };
  }
  const { error } = await svc
    .from("subscriptions")
    .update({
      tier: "draft",
      status: "cancelled",
      plan_source: "stripe",
      comp_until: null,
      updated_at: now.toISOString(),
    })
    .eq("user_id", userId)
    .eq("plan_source", "manual");
  return error ? { success: false, error: error.message ?? "Couldn't save" } : { success: true };
}
