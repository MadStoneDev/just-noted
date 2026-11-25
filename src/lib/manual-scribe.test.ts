import { describe, it, expect } from "vitest";
import { grantManualScribe, revokeManualScribe } from "@/lib/manual-scribe";
import { resolvePlanTier } from "@/lib/subscription";
import { fakeSupabase } from "@/lib/fake-supabase.testutil";

describe("grantManualScribe", () => {
  it("creates a permanent manual Scribe grant for a new user", async () => {
    const db = fakeSupabase({ subscriptions: [] });
    expect(await grantManualScribe(db.client, "u1")).toEqual({ success: true });
    const r = db.row("subscriptions", "u1");
    expect(r).toMatchObject({ tier: "scribe", status: "active", plan_source: "manual", comp_until: null, stripe_subscription_id: null });
    expect(resolvePlanTier(r)).toBe("scribe");
  });

  it("clears a lapsed subscriber's old stripe_subscription_id but keeps their customer", async () => {
    const db = fakeSupabase({
      subscriptions: [{ user_id: "u1", tier: "draft", status: "canceled", plan_source: "stripe", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_old" }],
    });
    await grantManualScribe(db.client, "u1");
    expect(db.row("subscriptions", "u1")).toMatchObject({ plan_source: "manual", stripe_subscription_id: null, stripe_customer_id: "cus_1" });
  });

  it("refuses to override a live Stripe subscription", async () => {
    const live = { user_id: "u1", tier: "scribe", status: "active", plan_source: "stripe", stripe_subscription_id: "sub_live" };
    const db = fakeSupabase({ subscriptions: [{ ...live }] });
    const res = await grantManualScribe(db.client, "u1");
    expect(res.success).toBe(false);
    expect(db.row("subscriptions", "u1")).toEqual(live);
  });

  it("supports a time-boxed comp", async () => {
    const db = fakeSupabase({ subscriptions: [] });
    await grantManualScribe(db.client, "u1", "2027-01-01T00:00:00.000Z");
    expect(db.row("subscriptions", "u1").comp_until).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("revokeManualScribe", () => {
  it("returns a manual grant to Draft", async () => {
    const db = fakeSupabase({ subscriptions: [{ user_id: "u1", tier: "scribe", status: "active", plan_source: "manual" }] });
    expect(await revokeManualScribe(db.client, "u1")).toEqual({ success: true });
    expect(resolvePlanTier(db.row("subscriptions", "u1"))).toBe("draft");
  });

  it("never touches a Stripe-billed subscriber", async () => {
    const paid = { user_id: "u1", tier: "scribe", status: "active", plan_source: "stripe", stripe_subscription_id: "sub_1" };
    const db = fakeSupabase({ subscriptions: [{ ...paid }] });
    expect((await revokeManualScribe(db.client, "u1")).success).toBe(false);
    expect(db.row("subscriptions", "u1")).toEqual(paid);
  });

  it("no row is already Draft", async () => {
    const db = fakeSupabase({ subscriptions: [] });
    expect(await revokeManualScribe(db.client, "nobody")).toEqual({ success: true });
    expect(db.writes).toHaveLength(0);
  });
});
