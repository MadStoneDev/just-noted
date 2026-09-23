"use server";

import { createClient } from "@/utils/supabase/server";

/**
 * Create a Paddle customer-portal session so the user can manage/cancel their
 * subscription. Returns null when billing isn't configured (no API key) or the
 * user has no Paddle customer yet — the Manage button is hidden in that case.
 */
export async function getPortalUrl(): Promise<string | null> {
  const apiKey = process.env.PADDLE_API_KEY;
  if (!apiKey) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("paddle_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const customerId = (sub as any)?.paddle_customer_id;
  if (!customerId) return null;

  const base =
    process.env.NEXT_PUBLIC_PADDLE_ENV === "production"
      ? "https://api.paddle.com"
      : "https://sandbox-api.paddle.com";

  try {
    const res = await fetch(`${base}/customers/${customerId}/portal-sessions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data?.urls?.general?.overview ?? null;
  } catch {
    return null;
  }
}
