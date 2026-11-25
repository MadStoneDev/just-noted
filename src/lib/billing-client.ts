"use client";

import { createScribeCheckout } from "@/app/actions/billingActions";
import type { BillingInterval } from "@/lib/plans";

/**
 * Client billing helper. JustNoted has one paid tier, "Scribe", billed monthly
 * or yearly. The Checkout Session is created server-side (price from env, the
 * signed-in account attached) and the browser is sent to Stripe's hosted page.
 * Returns an error message to show, or null once the redirect has started.
 */
export async function openUpgradeCheckout(interval: BillingInterval): Promise<string | null> {
  const res = await createScribeCheckout(interval);
  if ("url" in res) {
    window.location.href = res.url;
    return null;
  }
  switch (res.error) {
    case "already_scribe":
      return "You already have Scribe.";
    case "billing_issue":
      return "There's a problem with your current subscription. Open Manage billing to fix it.";
    case "not_signed_in":
      return "Sign in to upgrade.";
    case "not_configured":
      return "Checkout isn’t available yet. Billing is still being set up.";
    default:
      return "Couldn’t start checkout. Please try again.";
  }
}
