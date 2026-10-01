"use server";

import Stripe from "stripe";
import { createClient, createServiceRoleClient } from "@/utils/supabase/server";
import { confirmMatchesEmail, purgeAtFrom } from "@/lib/account-deletion";

/** The current user's pending deletion (for the restore/confirm gate), or none. */
export async function getAccountDeletionState(): Promise<{ pending: boolean; purgeAt: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { pending: false, purgeAt: null };
  const { data } = await supabase
    .from("account_deletions")
    .select("purge_at, status")
    .eq("user_id", user.id)
    .maybeSingle();
  const r = data as { purge_at?: string; status?: string } | null;
  if (r && r.status === "pending") return { pending: true, purgeAt: r.purge_at ?? null };
  return { pending: false, purgeAt: null };
}

/**
 * Schedule deletion (30-day grace). Verifies the typed email, cancels Stripe
 * FIRST and aborts if that fails (so billing never outlives the request), then
 * records the purge date. Content is hard-purged by the cron after the window;
 * until then the user can restore.
 */
export async function requestAccountDeletion(
  confirm: string,
): Promise<{ success: boolean; error?: string; purgeAt?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You're not signed in." };
  if (!confirmMatchesEmail(confirm, user.email)) {
    return { success: false, error: "Type your account email exactly to confirm." };
  }

  const svc = createServiceRoleClient();

  // Cancel Stripe first — abort if it fails.
  let stripeCanceled = false;
  const { data: sub } = await svc
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const subId = (sub as any)?.stripe_subscription_id as string | undefined;
  const secret = process.env.STRIPE_SECRET_KEY;
  if (subId && secret) {
    try {
      const stripe = new Stripe(secret);
      await stripe.subscriptions.cancel(subId);
      stripeCanceled = true;
    } catch (e) {
      console.error("[account] Stripe cancel failed on deletion request:", e instanceof Error ? e.message : e);
      return {
        success: false,
        error: "We couldn't cancel your subscription just now. Please try again, or contact support.",
      };
    }
  }

  const now = Date.now();
  const purgeAt = new Date(purgeAtFrom(now)).toISOString();
  const { error } = await svc.from("account_deletions").upsert(
    {
      user_id: user.id,
      requested_at: new Date(now).toISOString(),
      purge_at: purgeAt,
      stripe_canceled: stripeCanceled,
      status: "pending",
    } as any,
    { onConflict: "user_id" },
  );
  if (error) {
    console.error("[account] scheduling deletion failed:", error);
    return { success: false, error: "Couldn't schedule the deletion. Please try again." };
  }
  return { success: true, purgeAt };
}

/** Restore a pending account (delete the scheduled deletion). Note: a cancelled
 *  Stripe subscription is not restored — the user would re-subscribe. */
export async function cancelAccountDeletion(): Promise<{ success: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false };
  const { error } = await supabase
    .from("account_deletions")
    .delete()
    .eq("user_id", user.id)
    .eq("status", "pending");
  return { success: !error };
}
