"use server";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { Subscription, SubscriptionTier } from "@/types/subscription";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Fetch subscription from database
    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // No subscription found - return free tier
        return NextResponse.json({ status: 404 });
      }
      throw error;
    }

    const subscription: Subscription = {
      userId: data.user_id,
      tier: data.tier as SubscriptionTier,
      status: data.status,
      paddleSubscriptionId: data.paddle_subscription_id,
      paddleCustomerId: data.paddle_customer_id,
      currentPeriodEnd: data.current_period_end
        ? new Date(data.current_period_end).getTime()
        : undefined,
      cancelAtPeriodEnd: data.cancel_at_period_end,
      createdAt: new Date(data.created_at).getTime(),
      updatedAt: new Date(data.updated_at).getTime(),
    };

    return NextResponse.json({ subscription });
  } catch (error) {
    console.error("Subscription fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch subscription" },
      { status: 500 }
    );
  }
}
