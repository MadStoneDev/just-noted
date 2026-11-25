import { describe, it, expect, vi } from "vitest";
import type Stripe from "stripe";
import { handleStripeEvent, periodEnd } from "@/lib/stripe-webhook";
import { resolvePlanTier } from "@/lib/subscription";
import { fakeSupabase } from "@/lib/fake-supabase.testutil";

const env = {
  STRIPE_SCRIBE_PRICE_ID: "price_legacy_5",
  STRIPE_SCRIBE_MONTHLY_PRICE_ID: "price_monthly_7",
  STRIPE_SCRIBE_YEARLY_PRICE_ID: "price_yearly_70",
};
const PERIOD_END = 1_800_000_000; // seconds
const NOW = new Date("2026-11-25T00:00:00Z");

function sub(id: string, priceId: string, status: Stripe.Subscription.Status = "active", opts: { cancelAtEnd?: boolean } = {}) {
  return {
    id,
    object: "subscription",
    status,
    cancel_at_period_end: opts.cancelAtEnd ?? false,
    items: { data: [{ price: { id: priceId }, current_period_end: PERIOD_END }] },
  } as unknown as Stripe.Subscription;
}

function checkoutEvent(userId: string, subId: string, customer = "cus_1"): Stripe.Event {
  return {
    type: "checkout.session.completed",
    data: {
      object: { id: "cs_1", mode: "subscription", client_reference_id: userId, subscription: subId, customer },
    },
  } as unknown as Stripe.Event;
}

function subEvent(type: "customer.subscription.updated" | "customer.subscription.deleted", s: Stripe.Subscription): Stripe.Event {
  return { type, data: { object: s } } as unknown as Stripe.Event;
}

// Two comped accounts, mirroring production: Scribe, plan_source='manual', no
// Stripe subscription. MANUAL_B carries a stale subscription id (a former
// subscriber who was later comped) — the worst case for the update path.
const MANUAL_A = { user_id: "manual-a", tier: "scribe", status: "active", plan_source: "manual", comp_until: null, stripe_subscription_id: null };
const MANUAL_B = { user_id: "manual-b", tier: "scribe", status: "active", plan_source: "manual", comp_until: null, stripe_subscription_id: "sub_old" };

function setup(rows: any[], subs: Record<string, Stripe.Subscription> = {}) {
  const db = fakeSupabase({ subscriptions: rows });
  const retrieveSubscription = vi.fn(async (id: string) => subs[id]);
  const deps = { supabase: db.client, retrieveSubscription, env, now: () => NOW };
  return { db, deps };
}

describe("checkout.session.completed — new subscribers get the new prices", () => {
  it("monthly A$7 checkout grants Scribe and records the price", async () => {
    const { db, deps } = setup([], { sub_m: sub("sub_m", "price_monthly_7") });
    expect(await handleStripeEvent(checkoutEvent("u1", "sub_m"), deps)).toBe("checkout_applied");
    const r = db.row("subscriptions", "u1");
    expect(r).toMatchObject({
      tier: "scribe",
      status: "active",
      plan_source: "stripe",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_m",
      stripe_price_id: "price_monthly_7",
    });
    expect(resolvePlanTier(r)).toBe("scribe");
  });

  it("yearly A$70 checkout grants Scribe", async () => {
    const { db, deps } = setup([], { sub_y: sub("sub_y", "price_yearly_70") });
    await handleStripeEvent(checkoutEvent("u2", "sub_y"), deps);
    const r = db.row("subscriptions", "u2");
    expect(r).toMatchObject({ tier: "scribe", stripe_price_id: "price_yearly_70" });
    expect(resolvePlanTier(r)).toBe("scribe");
  });

  it("stores the renewal date from the subscription item (current API version)", async () => {
    const { db, deps } = setup([], { sub_m: sub("sub_m", "price_monthly_7") });
    await handleStripeEvent(checkoutEvent("u1", "sub_m"), deps);
    expect(db.row("subscriptions", "u1").current_period_end).toBe(new Date(PERIOD_END * 1000).toISOString());
  });

  it("an unrecognised price does not grant Scribe", async () => {
    const { db, deps } = setup([], { sub_x: sub("sub_x", "price_unknown") });
    await handleStripeEvent(checkoutEvent("u3", "sub_x"), deps);
    expect(resolvePlanTier(db.row("subscriptions", "u3"))).toBe("draft");
  });

  it("ignores non-subscription or unattributed sessions", async () => {
    const { db, deps } = setup([]);
    const noUser = checkoutEvent("", "sub_m");
    expect(await handleStripeEvent(noUser, deps)).toBe("ignored");
    expect(db.writes).toHaveLength(0);
  });
});

describe("existing A$5 subscribers keep Scribe", () => {
  const LEGACY = {
    user_id: "legacy",
    tier: "scribe",
    status: "active",
    plan_source: "stripe",
    stripe_subscription_id: "sub_legacy",
    stripe_price_id: null, // not backfilled yet
  };

  it("a renewal (subscription.updated) on the A$5 price stays Scribe", async () => {
    const { db, deps } = setup([{ ...LEGACY }]);
    await handleStripeEvent(subEvent("customer.subscription.updated", sub("sub_legacy", "price_legacy_5")), deps);
    const r = db.row("subscriptions", "legacy");
    expect(r).toMatchObject({ tier: "scribe", status: "active", stripe_price_id: "price_legacy_5" });
    expect(resolvePlanTier(r)).toBe("scribe");
  });

  it("cancel-at-period-end keeps Scribe until the period ends", async () => {
    const { db, deps } = setup([{ ...LEGACY }]);
    await handleStripeEvent(
      subEvent("customer.subscription.updated", sub("sub_legacy", "price_legacy_5", "active", { cancelAtEnd: true })),
      deps,
    );
    const r = db.row("subscriptions", "legacy");
    expect(r.cancel_at_period_end).toBe(true);
    expect(resolvePlanTier(r)).toBe("scribe");
  });

  it("subscription.deleted moves a Stripe subscriber to Draft", async () => {
    const { db, deps } = setup([{ ...LEGACY }]);
    await handleStripeEvent(subEvent("customer.subscription.deleted", sub("sub_legacy", "price_legacy_5", "canceled")), deps);
    expect(resolvePlanTier(db.row("subscriptions", "legacy"))).toBe("draft");
  });
});

describe("manual (comped) accounts are never touched by billing", () => {
  const events: [string, Stripe.Event][] = [
    ["subscription.updated (unknown price)", subEvent("customer.subscription.updated", sub("sub_old", "price_unknown"))],
    ["subscription.updated (past_due)", subEvent("customer.subscription.updated", sub("sub_old", "price_legacy_5", "past_due"))],
    ["subscription.deleted", subEvent("customer.subscription.deleted", sub("sub_old", "price_legacy_5", "canceled"))],
  ];

  for (const [name, event] of events) {
    it(`${name} for a matching stale subscription id leaves both manual rows unchanged`, async () => {
      const { db, deps } = setup([{ ...MANUAL_A }, { ...MANUAL_B }]);
      await handleStripeEvent(event, deps);
      expect(db.row("subscriptions", "manual-a")).toEqual(MANUAL_A);
      expect(db.row("subscriptions", "manual-b")).toEqual(MANUAL_B);
      expect(resolvePlanTier(db.row("subscriptions", "manual-b"))).toBe("scribe");
    });
  }

  it("a checkout that wouldn't grant Scribe (unknown price) can't replace a manual grant", async () => {
    const { db, deps } = setup([{ ...MANUAL_A }], { sub_x: sub("sub_x", "price_unknown") });
    expect(await handleStripeEvent(checkoutEvent("manual-a", "sub_x"), deps)).toBe("checkout_skipped_manual");
    expect(db.row("subscriptions", "manual-a")).toEqual(MANUAL_A);
  });

  it("a checkout in a non-active state (incomplete) can't replace a manual grant", async () => {
    const { db, deps } = setup([{ ...MANUAL_A }], { sub_i: sub("sub_i", "price_monthly_7", "incomplete") });
    await handleStripeEvent(checkoutEvent("manual-a", "sub_i"), deps);
    expect(db.row("subscriptions", "manual-a")).toEqual(MANUAL_A);
  });

  it("a real paid checkout takes a manual account over to Stripe and it stays Scribe", async () => {
    const { db, deps } = setup([{ ...MANUAL_A }], { sub_m: sub("sub_m", "price_monthly_7") });
    await handleStripeEvent(checkoutEvent("manual-a", "sub_m"), deps);
    const r = db.row("subscriptions", "manual-a");
    expect(r).toMatchObject({ plan_source: "stripe", tier: "scribe", stripe_subscription_id: "sub_m" });
    expect(resolvePlanTier(r)).toBe("scribe");
  });

  it("other users' events never write to manual rows", async () => {
    const { db, deps } = setup(
      [{ ...MANUAL_A }, { ...MANUAL_B }, { user_id: "paid", tier: "scribe", status: "active", plan_source: "stripe", stripe_subscription_id: "sub_paid" }],
      { sub_new: sub("sub_new", "price_yearly_70") },
    );
    await handleStripeEvent(subEvent("customer.subscription.deleted", sub("sub_paid", "price_monthly_7", "canceled")), deps);
    await handleStripeEvent(checkoutEvent("new-user", "sub_new"), deps);
    expect(db.row("subscriptions", "manual-a")).toEqual(MANUAL_A);
    expect(db.row("subscriptions", "manual-b")).toEqual(MANUAL_B);
  });
});

describe("periodEnd", () => {
  it("reads the item field, falls back to the legacy top-level field", () => {
    expect(periodEnd(sub("s", "p"))).toBe(new Date(PERIOD_END * 1000).toISOString());
    const legacy = { id: "s", items: { data: [{ price: { id: "p" } }] }, current_period_end: 1_700_000_000 } as any;
    expect(periodEnd(legacy)).toBe(new Date(1_700_000_000 * 1000).toISOString());
    expect(periodEnd({ id: "s", items: { data: [] } } as any)).toBeNull();
  });
});
