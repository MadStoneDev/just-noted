// Server-created Stripe Checkout Sessions for Scribe. Pure (no I/O) so who may
// check out, and with which price, is unit-tested.

import type Stripe from "stripe";
import type { BillingInterval } from "@/lib/plans";
import { resolvePlanTier, type SubscriptionRow } from "@/lib/subscription";
import { checkoutPriceId } from "@/lib/stripe-prices";

type Env = Record<string, string | undefined>;

/**
 * Checkout settings carried over from the old Scribe Payment Link. Values that
 * couldn't be read from the dashboard are Stripe's defaults; check each against
 * the Payment Link before go-live (see the deploy notes).
 */
export const CHECKOUT_SETTINGS = {
  // No GST: RAVENCI Solutions isn't registered, so Stripe Tax stays off.
  automaticTax: false,
  // Stripe's default: only collect a billing address when the payment method needs it.
  billingAddressCollection: "auto" as const,
  allowPromotionCodes: false,
  successPath: "/pricing?checkout=success",
  cancelPath: "/pricing?checkout=cancelled",
};

export type CheckoutBlock =
  | "already_scribe" // Scribe from any source (manual or Stripe)
  | "billing_issue"; // an existing Stripe subscription in a failed state

export interface CheckoutRow extends SubscriptionRow {
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
}

/**
 * Why this account must not start a new checkout, or null if it may. Manual
 * (comped) accounts are already Scribe, so they're never sent to checkout; a
 * Stripe subscription that's past due must be fixed in the portal rather than
 * duplicated.
 */
export function checkoutBlockReason(row: CheckoutRow | null | undefined, now: number = Date.now()): CheckoutBlock | null {
  if (!row) return null;
  if (resolvePlanTier(row, now) === "scribe") return "already_scribe";
  if (
    row.plan_source !== "manual" &&
    row.stripe_subscription_id &&
    (row.status === "past_due" || row.status === "unpaid" || row.status === "incomplete")
  ) {
    return "billing_issue";
  }
  return null;
}

export function appBaseUrl(env: Env = process.env): string {
  return (env.NEXT_PUBLIC_APP_URL || "https://justnoted.app").replace(/\/+$/, "");
}

export function buildCheckoutParams(opts: {
  interval: BillingInterval;
  userId: string;
  email: string | null | undefined;
  stripeCustomerId: string | null | undefined;
  env?: Env;
}): Stripe.Checkout.SessionCreateParams | null {
  const price = checkoutPriceId(opts.interval, opts.env);
  if (!price || !opts.userId) return null;
  const base = appBaseUrl(opts.env);

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    // The webhook maps the completed checkout back to this account.
    client_reference_id: opts.userId,
    metadata: { user_id: opts.userId, interval: opts.interval },
    subscription_data: { metadata: { user_id: opts.userId } },
    success_url: `${base}${CHECKOUT_SETTINGS.successPath}`,
    cancel_url: `${base}${CHECKOUT_SETTINGS.cancelPath}`,
    billing_address_collection: CHECKOUT_SETTINGS.billingAddressCollection,
    automatic_tax: { enabled: CHECKOUT_SETTINGS.automaticTax },
  };
  if (CHECKOUT_SETTINGS.allowPromotionCodes) params.allow_promotion_codes = true;

  // Reuse the Stripe customer when there is one (e.g. a lapsed subscriber), so
  // their billing history stays in one place; otherwise prefill the email.
  if (opts.stripeCustomerId) params.customer = opts.stripeCustomerId;
  else if (opts.email) params.customer_email = opts.email;

  return params;
}
