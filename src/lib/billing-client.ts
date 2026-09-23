"use client";

/**
 * Client billing helper (Stripe Payment Links). Upgrade opens the plan's
 * Payment Link with ?client_reference_id=<userId> so the Stripe webhook can map
 * the completed checkout back to this account (and prefills the email).
 */
function linkFor(tier: "pro" | "team"): string | undefined {
  return tier === "team"
    ? process.env.NEXT_PUBLIC_STRIPE_TEAM_PAYMENT_LINK
    : process.env.NEXT_PUBLIC_STRIPE_PRO_PAYMENT_LINK;
}

export function billingConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_STRIPE_PRO_PAYMENT_LINK;
}

export async function openUpgradeCheckout(opts: {
  tier: "pro" | "team";
  email?: string;
  userId: string;
}): Promise<boolean> {
  const base = linkFor(opts.tier);
  if (!base) return false;
  const url = new URL(base);
  url.searchParams.set("client_reference_id", opts.userId);
  if (opts.email) url.searchParams.set("prefilled_email", opts.email);
  window.location.href = url.toString();
  return true;
}
