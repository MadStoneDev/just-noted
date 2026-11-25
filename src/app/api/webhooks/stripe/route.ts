import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createServiceRoleClient } from "@/utils/supabase/server";
import { handleStripeEvent } from "@/lib/stripe-webhook";

// Stripe needs the raw request body to verify the signature.
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  // Fail closed: without a signing secret we can't verify authenticity.
  if (!secret || !webhookSecret) {
    console.error("Stripe billing is not configured; rejecting webhook");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const stripe = new Stripe(secret);
  const payload = await request.text();
  const sig = request.headers.get("stripe-signature") || "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, sig, webhookSecret);
  } catch {
    console.error("Invalid Stripe webhook signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    await handleStripeEvent(event, {
      supabase: createServiceRoleClient(),
      retrieveSubscription: (id) => stripe.subscriptions.retrieve(id),
    });
  } catch (e) {
    console.error("Stripe webhook processing error:", e);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
