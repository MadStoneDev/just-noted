import { describe, it, expect } from "vitest";
import { buildCheckoutParams, checkoutBlockReason, CHECKOUT_SETTINGS } from "@/lib/stripe-checkout";

const env = {
  NEXT_PUBLIC_APP_URL: "https://justnoted.app/",
  STRIPE_SCRIBE_PRICE_ID: "price_legacy_5",
  STRIPE_SCRIBE_MONTHLY_PRICE_ID: "price_monthly_7",
  STRIPE_SCRIBE_YEARLY_PRICE_ID: "price_yearly_70",
};

describe("buildCheckoutParams — new subscribers get the new price", () => {
  it("monthly uses the A$7 price, attributed to the signed-in user", () => {
    const p = buildCheckoutParams({ interval: "month", userId: "u1", email: "a@example.com", stripeCustomerId: null, env })!;
    expect(p.mode).toBe("subscription");
    expect(p.line_items).toEqual([{ price: "price_monthly_7", quantity: 1 }]);
    expect(p.client_reference_id).toBe("u1");
    expect(p.subscription_data?.metadata).toEqual({ user_id: "u1" });
    expect(p.customer_email).toBe("a@example.com");
    expect(p.customer).toBeUndefined();
  });

  it("yearly uses the A$70 price", () => {
    const p = buildCheckoutParams({ interval: "year", userId: "u1", email: null, stripeCustomerId: null, env })!;
    expect(p.line_items).toEqual([{ price: "price_yearly_70", quantity: 1 }]);
  });

  it("never sells the legacy A$5 price", () => {
    for (const interval of ["month", "year"] as const) {
      const p = buildCheckoutParams({ interval, userId: "u1", email: null, stripeCustomerId: null, env })!;
      expect(JSON.stringify(p)).not.toContain("price_legacy_5");
    }
  });

  it("returns null when the interval's price isn't configured", () => {
    expect(buildCheckoutParams({ interval: "year", userId: "u1", email: null, stripeCustomerId: null, env: { STRIPE_SCRIBE_PRICE_ID: "price_legacy_5" } })).toBeNull();
  });

  it("reuses an existing Stripe customer instead of the email", () => {
    const p = buildCheckoutParams({ interval: "month", userId: "u1", email: "a@example.com", stripeCustomerId: "cus_9", env })!;
    expect(p.customer).toBe("cus_9");
    expect(p.customer_email).toBeUndefined();
  });

  it("applies the checkout settings (promo codes on, tax off, address auto)", () => {
    const p = buildCheckoutParams({ interval: "month", userId: "u1", email: null, stripeCustomerId: null, env })!;
    expect(p.success_url).toBe(`https://justnoted.app${CHECKOUT_SETTINGS.successPath}`);
    expect(p.cancel_url).toBe(`https://justnoted.app${CHECKOUT_SETTINGS.cancelPath}`);
    expect(p.allow_promotion_codes).toBe(true);
    expect(p.automatic_tax).toEqual({ enabled: false });
    expect(p.billing_address_collection).toBe("auto");
  });
});

describe("checkoutBlockReason — who may start a checkout", () => {
  it("new users and lapsed subscribers may", () => {
    expect(checkoutBlockReason(null)).toBeNull();
    expect(checkoutBlockReason({ tier: "draft", status: "cancelled", plan_source: "stripe", stripe_subscription_id: "sub_old" })).toBeNull();
  });

  it("manual (comped) accounts are never sent to checkout", () => {
    expect(checkoutBlockReason({ tier: "scribe", status: "active", plan_source: "manual" })).toBe("already_scribe");
    // even with a stale status
    expect(checkoutBlockReason({ tier: "scribe", status: "cancelled", plan_source: "manual" })).toBe("already_scribe");
  });

  it("an expired comp may subscribe", () => {
    expect(checkoutBlockReason({ tier: "scribe", status: "active", plan_source: "manual", comp_until: "2020-01-01T00:00:00Z" })).toBeNull();
  });

  it("active Stripe subscribers (including on A$5) can't buy a second subscription", () => {
    expect(checkoutBlockReason({ tier: "scribe", status: "active", plan_source: "stripe", stripe_subscription_id: "sub_legacy" })).toBe("already_scribe");
  });

  it("a past-due subscription must be fixed, not duplicated", () => {
    expect(checkoutBlockReason({ tier: "scribe", status: "past_due", plan_source: "stripe", stripe_subscription_id: "sub_1" })).toBe("billing_issue");
  });
});
