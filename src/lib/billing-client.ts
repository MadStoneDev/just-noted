"use client";

/**
 * Client billing helper (Stripe Payment Links). JustNoted has one paid tier,
 * "Scribe". Upgrade opens its Payment Link with ?client_reference_id=<userId>
 * so the Stripe webhook can map the completed checkout back to this account
 * (and prefills the email).
 */
export function billingConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_STRIPE_SCRIBE_PAYMENT_LINK;
}

export async function openUpgradeCheckout(opts: {
  email?: string;
  userId: string;
}): Promise<boolean> {
  const base = process.env.NEXT_PUBLIC_STRIPE_SCRIBE_PAYMENT_LINK;
  if (!base) return false;
  const url = new URL(base);
  url.searchParams.set("client_reference_id", opts.userId);
  if (opts.email) url.searchParams.set("prefilled_email", opts.email);
  window.location.href = url.toString();
  return true;
}
