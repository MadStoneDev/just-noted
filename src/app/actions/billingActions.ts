"use server";

import Stripe from "stripe";
import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";

/**
 * Create a Stripe Billing Portal session so the user can manage/cancel their
 * subscription. Returns null when billing isn't configured (no secret key) or
 * the user has no Stripe customer yet — the Manage button is hidden then.
 */
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
  if (!customerId) return null;

  try {
    const stripe = new Stripe(secret);
    const hdrs = await headers();
    const origin = hdrs.get("origin") || (hdrs.get("host") ? `https://${hdrs.get("host")}` : "");
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: origin || undefined,
    });
    return session.url;
  } catch {
    return null;
  }
}
