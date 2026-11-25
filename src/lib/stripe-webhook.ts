// Stripe webhook → subscriptions row. Kept out of the route file so it can be
// tested against an in-memory Supabase fake with no network.
//
// Invariant: a plan_source='manual' (comped/admin) account is never downgraded
// by billing. Subscription update/delete events only touch Stripe-managed rows,
// and a checkout only takes over a manual row when it actually grants Scribe.

import type Stripe from "stripe";
import type { SubscriptionTier } from "@/types/subscription";
import { resolvePlanTier } from "@/lib/subscription";
import { isScribePriceId } from "@/lib/stripe-prices";

type Env = Record<string, string | undefined>;

export interface WebhookDeps {
  // Minimal Supabase surface used here (service-role client in production).
  supabase: { from: (table: string) => any };
  retrieveSubscription: (id: string) => Promise<Stripe.Subscription>;
  env?: Env;
  now?: () => Date;
}

export type WebhookOutcome =
  | "ignored"
  | "checkout_applied"
  | "checkout_skipped_manual"
  | "subscription_synced";

export function subscriptionPriceId(sub: Stripe.Subscription): string | null {
  return sub.items?.data?.[0]?.price?.id ?? null;
}

export function tierForPrice(priceId: string | null, env?: Env): SubscriptionTier {
  return isScribePriceId(priceId, env) ? "scribe" : "draft";
}

/**
 * The paid-through date. Since API version 2025-03-31 it lives on the
 * subscription item, not the subscription; read the item first and fall back to
 * the old top-level field (events sent on an older endpoint API version).
 */
export function periodEnd(sub: Stripe.Subscription): string | null {
  const itemEnd = (sub.items?.data?.[0] as any)?.current_period_end;
  const end = typeof itemEnd === "number" ? itemEnd : (sub as any).current_period_end;
  return typeof end === "number" ? new Date(end * 1000).toISOString() : null;
}

export async function handleStripeEvent(event: Stripe.Event, deps: WebhookDeps): Promise<WebhookOutcome> {
  const { supabase, env } = deps;
  const nowIso = (deps.now ? deps.now() : new Date()).toISOString();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id;
      if (!userId || session.mode !== "subscription" || !session.subscription) return "ignored";

      const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
      const sub = await deps.retrieveSubscription(subId);
      const priceId = subscriptionPriceId(sub);
      const tier = tierForPrice(priceId, env);

      const next = {
        user_id: userId,
        tier,
        status: sub.status,
        plan_source: "stripe",
        comp_until: null,
        stripe_customer_id:
          (typeof session.customer === "string" ? session.customer : session.customer?.id) ?? null,
        stripe_subscription_id: sub.id,
        stripe_price_id: priceId,
        current_period_end: periodEnd(sub),
        cancel_at_period_end: sub.cancel_at_period_end ?? false,
        updated_at: nowIso,
      };

      // A paid checkout normally takes the account over from a manual comp
      // (manual -> stripe). But never let it replace a manual grant with
      // something that isn't Scribe (e.g. an unrecognised price id).
      const { data: existing } = await supabase
        .from("subscriptions")
        .select("plan_source")
        .eq("user_id", userId)
        .maybeSingle();
      if ((existing as any)?.plan_source === "manual" && resolvePlanTier(next) !== "scribe") {
        console.error(
          `[stripe] checkout ${session.id} for manual account ${userId} would not grant Scribe ` +
            `(price ${priceId ?? "none"}, status ${sub.status}); left the manual grant untouched`,
        );
        return "checkout_skipped_manual";
      }

      const { error } = await supabase.from("subscriptions").upsert(next, { onConflict: "user_id" });
      if (error) throw new Error(error.message ?? String(error));
      return "checkout_applied";
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const priceId = subscriptionPriceId(sub);
      const tier = event.type === "customer.subscription.deleted" ? "draft" : tierForPrice(priceId, env);
      // Only Stripe-managed rows: a manual grant can carry an old
      // stripe_subscription_id (e.g. a former subscriber who was comped), and an
      // event from that old subscription must not downgrade it.
      const { error } = await supabase
        .from("subscriptions")
        .update({
          tier,
          status: sub.status,
          stripe_price_id: priceId,
          current_period_end: periodEnd(sub),
          cancel_at_period_end: sub.cancel_at_period_end ?? false,
          updated_at: nowIso,
        })
        .eq("stripe_subscription_id", sub.id)
        .eq("plan_source", "stripe");
      if (error) throw new Error(error.message ?? String(error));
      return "subscription_synced";
    }

    default:
      return "ignored";
  }
}
