// Which Stripe price ids mean "Scribe", and which one a new checkout uses.
//
// Pure (env passed in) so the mapping is unit-tested. Several price ids can
// grant Scribe at once: the original A$5/month price (STRIPE_SCRIBE_PRICE_ID —
// nobody new can buy it, but it stays recognised so any subscription on it
// keeps Scribe) plus the current monthly and yearly prices. New checkouts only
// ever use the current ones.

import { PLANS, type BillingInterval } from "@/lib/plans";

type Env = Record<string, string | undefined>;

/** The original Scribe price, shown to anyone still subscribed on it. */
export const LEGACY_SCRIBE_PRICE_DISPLAY = "A$5/month";

export interface ScribePriceIds {
  legacyMonthly: string | null; // A$5/month — recognised, never sold
  monthly: string | null; // current monthly price
  yearly: string | null; // current yearly price
}

function clean(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t ? t : null;
}

export function scribePriceIds(env: Env = process.env): ScribePriceIds {
  return {
    legacyMonthly: clean(env.STRIPE_SCRIBE_PRICE_ID),
    monthly: clean(env.STRIPE_SCRIBE_MONTHLY_PRICE_ID),
    yearly: clean(env.STRIPE_SCRIBE_YEARLY_PRICE_ID),
  };
}

/** True when a subscription on this price should have Scribe. */
export function isScribePriceId(priceId: string | null | undefined, env: Env = process.env): boolean {
  if (!priceId) return false;
  const ids = scribePriceIds(env);
  return priceId === ids.legacyMonthly || priceId === ids.monthly || priceId === ids.yearly;
}

/** The price a new checkout for this interval uses (never the legacy one). */
export function checkoutPriceId(interval: BillingInterval, env: Env = process.env): string | null {
  const ids = scribePriceIds(env);
  return interval === "year" ? ids.yearly : ids.monthly;
}

/** Which intervals can be bought right now (their price id is configured). */
export function checkoutAvailability(env: Env = process.env): Record<BillingInterval, boolean> {
  const configured = !!clean(env.STRIPE_SECRET_KEY);
  return {
    month: configured && !!checkoutPriceId("month", env),
    year: configured && !!checkoutPriceId("year", env),
  };
}

/**
 * The price text for a subscriber's actual price, so someone on an older price
 * is never shown today's list price. Null when unknown (the UI then shows no
 * price rather than a wrong one).
 */
export function priceDisplayFor(priceId: string | null | undefined, env: Env = process.env): string | null {
  if (!priceId) return null;
  const ids = scribePriceIds(env);
  if (priceId === ids.monthly) return PLANS.scribe.price.display;
  if (priceId === ids.yearly) return PLANS.scribe.price.yearly?.display ?? null;
  if (priceId === ids.legacyMonthly) return LEGACY_SCRIBE_PRICE_DISPLAY;
  return null;
}
