import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createServiceRoleClient } from "@/utils/supabase/server";
import type { SubscriptionTier } from "@/types/subscription";

// Stripe needs the raw request body to verify the signature.
export const dynamic = "force-dynamic";

function tierFromPriceId(priceId: string | undefined): SubscriptionTier {
  if (priceId && priceId === process.env.STRIPE_SCRIBE_PRICE_ID) return "scribe";
  return "draft";
}

function periodEnd(sub: Stripe.Subscription): string | null {
  const end = (sub as any).current_period_end;
  return typeof end === "number" ? new Date(end * 1000).toISOString() : null;
}

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

  const supabase = createServiceRoleClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id;
        if (!userId || session.mode !== "subscription" || !session.subscription) break;

        const sub = await stripe.subscriptions.retrieve(session.subscription as string);
        const tier = tierFromPriceId(sub.items.data[0]?.price?.id);

        await supabase.from("subscriptions").upsert(
          {
            user_id: userId,
            tier,
            status: sub.status,
            stripe_customer_id: (session.customer as string) ?? null,
            stripe_subscription_id: sub.id,
            current_period_end: periodEnd(sub),
            cancel_at_period_end: sub.cancel_at_period_end ?? false,
            updated_at: new Date().toISOString(),
          } as any,
          { onConflict: "user_id" },
        );
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const tier =
          event.type === "customer.subscription.deleted"
            ? "draft"
            : tierFromPriceId(sub.items.data[0]?.price?.id);
        await supabase
          .from("subscriptions")
          .update({
            tier,
            status: sub.status,
            current_period_end: periodEnd(sub),
            cancel_at_period_end: sub.cancel_at_period_end ?? false,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("stripe_subscription_id", sub.id);
        break;
      }

      default:
        break;
    }
  } catch (e) {
    console.error("Stripe webhook processing error:", e);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
