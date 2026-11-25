import { describe, it, expect } from "vitest";
import {
  isScribePriceId,
  checkoutPriceId,
  checkoutAvailability,
  missingCheckoutEnv,
  priceDisplayFor,
  scribePriceIds,
  LEGACY_SCRIBE_PRICE_DISPLAY,
} from "@/lib/stripe-prices";

const env = {
  STRIPE_SECRET_KEY: "sk_test_x",
  STRIPE_SCRIBE_PRICE_ID: "price_legacy_5",
  STRIPE_SCRIBE_MONTHLY_PRICE_ID: "price_monthly_7",
  STRIPE_SCRIBE_YEARLY_PRICE_ID: "price_yearly_70",
};

describe("Scribe price ids", () => {
  it("recognises the legacy A$5, new monthly and new yearly prices as Scribe", () => {
    expect(isScribePriceId("price_legacy_5", env)).toBe(true);
    expect(isScribePriceId("price_monthly_7", env)).toBe(true);
    expect(isScribePriceId("price_yearly_70", env)).toBe(true);
  });

  it("anything else (or nothing) is not Scribe", () => {
    expect(isScribePriceId("price_other", env)).toBe(false);
    expect(isScribePriceId(null, env)).toBe(false);
    expect(isScribePriceId("", env)).toBe(false);
  });

  it("an unset env var never matches an empty/undefined price", () => {
    const partial = { STRIPE_SCRIBE_MONTHLY_PRICE_ID: "price_monthly_7" };
    expect(isScribePriceId(undefined, partial)).toBe(false);
    expect(scribePriceIds(partial)).toEqual({ legacyMonthly: null, monthly: "price_monthly_7", yearly: null });
  });

  it("trims whitespace from env values", () => {
    expect(isScribePriceId("price_yearly_70", { STRIPE_SCRIBE_YEARLY_PRICE_ID: " price_yearly_70\n" })).toBe(true);
  });
});

describe("new checkouts", () => {
  it("use the new monthly / yearly prices, never the legacy A$5 price", () => {
    expect(checkoutPriceId("month", env)).toBe("price_monthly_7");
    expect(checkoutPriceId("year", env)).toBe("price_yearly_70");
    expect(checkoutPriceId("month", { STRIPE_SCRIBE_PRICE_ID: "price_legacy_5" })).toBeNull();
  });

  it("availability needs the secret key and that interval's price", () => {
    expect(checkoutAvailability(env)).toEqual({ month: true, year: true });
    expect(checkoutAvailability({ ...env, STRIPE_SECRET_KEY: "" })).toEqual({ month: false, year: false });
    expect(checkoutAvailability({ ...env, STRIPE_SCRIBE_YEARLY_PRICE_ID: "" })).toEqual({ month: true, year: false });
  });
});

describe("priceDisplayFor — a subscriber sees their own price", () => {
  it("maps each price to its text", () => {
    expect(priceDisplayFor("price_monthly_7", env)).toBe("A$7/month");
    expect(priceDisplayFor("price_yearly_70", env)).toBe("A$70/year");
    expect(priceDisplayFor("price_legacy_5", env)).toBe(LEGACY_SCRIBE_PRICE_DISPLAY);
  });
  it("unknown or missing price shows nothing rather than a wrong price", () => {
    expect(priceDisplayFor("price_other", env)).toBeNull();
    expect(priceDisplayFor(null, env)).toBeNull();
  });
});

describe("missingCheckoutEnv — names a half-configured deploy", () => {
  it("nothing missing when fully configured", () => {
    expect(missingCheckoutEnv(env)).toEqual([]);
  });
  it("names the yearly price when only monthly is set (the production bug)", () => {
    expect(missingCheckoutEnv({ ...env, STRIPE_SCRIBE_YEARLY_PRICE_ID: undefined })).toEqual(["STRIPE_SCRIBE_YEARLY_PRICE_ID"]);
    expect(missingCheckoutEnv({ ...env, STRIPE_SCRIBE_YEARLY_PRICE_ID: "  " })).toEqual(["STRIPE_SCRIBE_YEARLY_PRICE_ID"]);
  });
});
