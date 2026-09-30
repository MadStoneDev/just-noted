"use server";

import Stripe from "stripe";
import { headers } from "next/headers";
import { createClient, createServiceRoleClient } from "@/utils/supabase/server";
import { resolvePlanTier, billingStateFor, type BillingState } from "@/lib/subscription";
import type { SubscriptionTier } from "@/types/subscription";

/**
 * Create a Stripe Billing Portal session so the user can manage/cancel their
 * subscription. Returns null when billing isn't configured (no secret key) or
 * the user has no Stripe customer yet — the Manage button is hidden then.
 */
export interface BillingStateResult {
  authenticated: boolean;
  tier: SubscriptionTier;
  planSource: "stripe" | "manual";
  compUntil: string | null;
  hasStripeCustomer: boolean;
  renews: string | null;
  cancelAtEnd: boolean;
  billingState: BillingState;
}

/**
 * The current viewer's plan + how it's managed, resolved server-side so the UI
 * shows the right controls (Manage / Complimentary / Billing issue) and never a
 * portal button that can only fail. Also lazily retires an expired manual comp
 * (downgrade + hand back to Stripe) since there's no expiry cron.
 */
export async function getBillingState(): Promise<BillingStateResult> {
  const empty: BillingStateResult = {
    authenticated: false,
    tier: "draft",
    planSource: "stripe",
    compUntil: null,
    hasStripeCustomer: false,
    renews: null,
    cancelAtEnd: false,
    billingState: "ok",
  };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return empty;

  const svc = createServiceRoleClient();
  const { data: row } = await svc
    .from("subscriptions")
    .select("tier, status, plan_source, comp_until, current_period_end, cancel_at_period_end, stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const r = row as any;
  const planSource: "stripe" | "manual" = r?.plan_source === "manual" ? "manual" : "stripe";
  const compUntil: string | null = r?.comp_until ?? null;

  // Lazy expiry: an elapsed manual comp downgrades to free and hands the row
  // back to Stripe so future real billing takes over cleanly. resolvePlanTier
  // already reads it as free, so this is only row cleanup — safe to best-effort.
  if (
    planSource === "manual" &&
    compUntil &&
    new Date(compUntil).getTime() <= Date.now() &&
    r?.tier === "scribe"
  ) {
    await svc
      .from("subscriptions")
      .update({ tier: "draft", status: "cancelled", plan_source: "stripe", comp_until: null, updated_at: new Date().toISOString() } as any)
      .eq("user_id", user.id);
  }

  const tier = resolvePlanTier(r ?? null);
  const hasStripeCustomer = !!r?.stripe_customer_id;
  const isPaid = tier === "scribe";
  const billingState = billingStateFor({ isPaid, planSource, hasStripeCustomer });

  if (billingState === "billing_issue") {
    console.warn(`[billing] Scribe (stripe) without stripe_customer_id for user ${user.id}`);
  }

  return {
    authenticated: true,
    tier,
    planSource,
    compUntil,
    hasStripeCustomer,
    renews: r?.current_period_end ?? null,
    cancelAtEnd: !!r?.cancel_at_period_end,
    billingState,
  };
}

export async function getPortalUrl(): Promise<string | null> {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const customerId = (sub as any)?.stripe_customer_id;
  if (!customerId) {
    console.error("[billing] getPortalUrl: no stripe_customer_id for user", user.id);
    return null;
  }

  try {
    const stripe = new Stripe(secret);
    const hdrs = await headers();
    const origin = hdrs.get("origin") || (hdrs.get("host") ? `https://${hdrs.get("host")}` : "");
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: origin || undefined,
    });
    return session.url;
  } catch (err) {
    // Most common: the Customer Portal hasn't been activated in the Stripe
    // dashboard (Settings → Billing → Customer portal → Save), which makes
    // billingPortal.sessions.create throw. Log the real reason so it's visible.
    console.error("[billing] getPortalUrl: Stripe portal error:", err instanceof Error ? err.message : err);
    return null;
  }
}
