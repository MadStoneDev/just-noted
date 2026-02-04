"use server";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { Subscription, SubscriptionTier } from "@/types/subscription";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Verify authentication - users can only fetch their own subscription
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Use authenticated user's ID instead of query parameter
    const userId = user.id;

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
    console.error("Subscription fetch error");
    return NextResponse.json(
      { error: "Failed to fetch subscription" },
      { status: 500 }
    );
  }
}
