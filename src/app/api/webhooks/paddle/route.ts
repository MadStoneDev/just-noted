import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/server";
import { PaddleWebhookEvent, SubscriptionTier } from "@/types/subscription";
import crypto from "crypto";

// Reject events whose timestamp is older than this (replay protection).
const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;

// Verify a Paddle webhook signature.
// Paddle sends `Paddle-Signature: ts=<unix>;h1=<hex>` where h1 = HMAC-SHA256
// over `${ts}:${rawBody}`. See https://developer.paddle.com/webhooks/signature-verification
function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  secretKey: string
): boolean {
  if (!secretKey || !signatureHeader) return false;

  // Parse `ts=...;h1=...`
  const parts = signatureHeader.split(";").reduce<Record<string, string>>((acc, part) => {
    const [key, value] = part.split("=");
    if (key && value) acc[key.trim()] = value.trim();
    return acc;
  }, {});

  const ts = parts["ts"];
  const h1 = parts["h1"];
  if (!ts || !h1) return false;

  // Replay protection: reject stale timestamps.
  const tsMs = Number(ts) * 1000;
  if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > MAX_SIGNATURE_AGE_MS) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secretKey)
    .update(`${ts}:${rawBody}`)
    .digest("hex");

  // Constant-time compare, guarding against length mismatch (which would
  // otherwise make timingSafeEqual throw).
  const a = Buffer.from(h1, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Map Paddle price IDs to tiers
function getTierFromPriceId(priceId: string): SubscriptionTier {
  const proPriceId = process.env.PADDLE_PRO_PRICE_ID;
  const teamPriceId = process.env.PADDLE_TEAM_PRICE_ID;

  if (priceId === proPriceId) return "pro";
  if (priceId === teamPriceId) return "team";
  return "free";
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.text();
    const signature = request.headers.get("paddle-signature") || "";
    const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET;

    // Fail closed: without a configured secret we cannot verify authenticity,
    // so we must reject rather than trust the payload (which grants entitlements).
    if (!webhookSecret) {
      console.error("PADDLE_WEBHOOK_SECRET is not configured; rejecting webhook");
      return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
    }

    if (!verifyWebhookSignature(payload, signature, webhookSecret)) {
      console.error("Invalid Paddle webhook signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const event: PaddleWebhookEvent = JSON.parse(payload);
    // Use service role client to bypass RLS for webhook operations
    const supabase = createServiceRoleClient();

    // Log event type only, no sensitive data
    console.log("Paddle webhook received:", event.event_type);

    switch (event.event_type) {
      case "subscription.created":
      case "subscription.activated": {
        const userId = event.data.custom_data?.userId;
        if (!userId) {
          console.error("Missing userId in subscription event");
          return NextResponse.json({ error: "Missing userId" }, { status: 400 });
        }

        // Determine tier from price ID
        const tier: SubscriptionTier = getTierFromPriceId(event.data.items?.[0]?.price?.id ?? "");

        await supabase.from("subscriptions").upsert({
          user_id: userId,
          tier,
          status: "active",
          paddle_subscription_id: event.data.subscription_id,
          paddle_customer_id: event.data.customer_id,
          current_period_end: event.data.billing_period?.ends_at,
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
        });

        console.log("Subscription created successfully");
        break;
      }

      case "subscription.updated": {
        const subscriptionId = event.data.subscription_id;
        if (!subscriptionId) break;

        const updates: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };

        if (event.data.status) {
          updates.status = event.data.status;
        }

        if (event.data.billing_period?.ends_at) {
          updates.current_period_end = event.data.billing_period.ends_at;
        }

        await supabase
          .from("subscriptions")
          .update(updates)
          .eq("paddle_subscription_id", subscriptionId);

        console.log("Subscription updated successfully");
        break;
      }

      case "subscription.canceled":
      case "subscription.paused": {
        const subscriptionId = event.data.subscription_id;
        if (!subscriptionId) break;

        await supabase
          .from("subscriptions")
          .update({
            status: "cancelled",
            cancel_at_period_end: true,
            updated_at: new Date().toISOString(),
          })
          .eq("paddle_subscription_id", subscriptionId);

        console.log("Subscription cancelled");
        break;
      }

      case "subscription.past_due": {
        const subscriptionId = event.data.subscription_id;
        if (!subscriptionId) break;

        await supabase
          .from("subscriptions")
          .update({
            status: "past_due",
            updated_at: new Date().toISOString(),
          })
          .eq("paddle_subscription_id", subscriptionId);

        console.log("Subscription marked as past due");
        break;
      }

      default:
        console.log(`Unhandled Paddle event: ${event.event_type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Paddle webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
