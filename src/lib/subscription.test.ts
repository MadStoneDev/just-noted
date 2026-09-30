import { describe, it, expect } from "vitest";
import { resolvePlanTier, billingStateFor } from "@/lib/subscription";

const DAY = 86400000;
const now = Date.now();
const future = new Date(now + 30 * DAY).toISOString();
const past = new Date(now - DAY).toISOString();

describe("resolvePlanTier — Stripe accounts", () => {
  it("no row → free", () => {
    expect(resolvePlanTier(null)).toBe("draft");
    expect(resolvePlanTier(undefined)).toBe("draft");
  });
  it("active/trialing Scribe → scribe", () => {
    expect(resolvePlanTier({ tier: "scribe", status: "active", plan_source: "stripe" })).toBe("scribe");
    expect(resolvePlanTier({ tier: "scribe", status: "trialing", plan_source: "stripe" })).toBe("scribe");
  });
  it("cancelled/past_due/draft → free", () => {
    expect(resolvePlanTier({ tier: "scribe", status: "cancelled", plan_source: "stripe" })).toBe("draft");
    expect(resolvePlanTier({ tier: "scribe", status: "past_due", plan_source: "stripe" })).toBe("draft");
    expect(resolvePlanTier({ tier: "draft", status: "active", plan_source: "stripe" })).toBe("draft");
  });
});

describe("resolvePlanTier — manual (comped) accounts", () => {
  it("manual Scribe with no comp window → scribe", () => {
    expect(resolvePlanTier({ tier: "scribe", status: "active", plan_source: "manual" })).toBe("scribe");
  });
  it("manual Scribe survives a stale/cancelled status (billing sync can't downgrade it)", () => {
    // Even if some path wrote status='cancelled', a manual grant stays Scribe.
    expect(resolvePlanTier({ tier: "scribe", status: "cancelled", plan_source: "manual" })).toBe("scribe");
  });
  it("manual Scribe within the comp window → scribe", () => {
    expect(resolvePlanTier({ tier: "scribe", status: "active", plan_source: "manual", comp_until: future })).toBe("scribe");
  });
  it("expired comp falls back to free at read time", () => {
    expect(resolvePlanTier({ tier: "scribe", status: "active", plan_source: "manual", comp_until: past })).toBe("draft");
  });
  it("manual draft → free", () => {
    expect(resolvePlanTier({ tier: "draft", status: "active", plan_source: "manual" })).toBe("draft");
  });
  it("honours an explicit now for the comp boundary", () => {
    const row = { tier: "scribe", status: "active", plan_source: "manual", comp_until: new Date(1000).toISOString() };
    expect(resolvePlanTier(row, 999)).toBe("scribe"); // before expiry
    expect(resolvePlanTier(row, 1001)).toBe("draft"); // after expiry
  });
});

describe("billingStateFor — which management control to show", () => {
  it("free tier is always ok (no billing controls)", () => {
    expect(billingStateFor({ isPaid: false, planSource: "stripe", hasStripeCustomer: false })).toBe("ok");
  });
  it("manual paid → 'manual' (Complimentary label, no portal)", () => {
    expect(billingStateFor({ isPaid: true, planSource: "manual", hasStripeCustomer: false })).toBe("manual");
  });
  it("stripe paid without a customer id → 'billing_issue' (no broken Manage button)", () => {
    expect(billingStateFor({ isPaid: true, planSource: "stripe", hasStripeCustomer: false })).toBe("billing_issue");
  });
  it("stripe paid with a customer id → 'ok' (Manage billing)", () => {
    expect(billingStateFor({ isPaid: true, planSource: "stripe", hasStripeCustomer: true })).toBe("ok");
  });
});
