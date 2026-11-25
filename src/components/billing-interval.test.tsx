// @vitest-environment jsdom
//
// Clicks the Monthly/Yearly toggle on /pricing and in Settings → Plan & usage
// and checks the price shown and the interval checkout is requested with.
// Regression for the production bug where Yearly was a dead (disabled) button
// because STRIPE_SCRIBE_YEARLY_PRICE_ID wasn't set at runtime.

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const billing = vi.hoisted(() => ({
  getBillingState: vi.fn(),
  createScribeCheckout: vi.fn(),
  getPortalUrl: vi.fn(),
}));
const toast = vi.hoisted(() => ({ showError: vi.fn(), showSuccess: vi.fn() }));

vi.mock("@/app/actions/billingActions", () => billing);
vi.mock("@/components/ui/toast", () => ({ useToast: () => toast }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/utils/supabase/client", () => {
  // Chainable query that resolves to an empty result (Settings' usage counts).
  const query: any = new Proxy(
    {},
    {
      get: (_t, prop) =>
        prop === "then"
          ? (resolve: (v: any) => void) => resolve({ data: [], count: 0, error: null })
          : () => query,
    },
  );
  return {
    createClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: "u1", email: "u1@example.com" } } }) },
      from: () => query,
    }),
  };
});

import PricingView from "@/components/pricing-view";
import BillingSection from "@/components/settings/billing-section";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function draftState(checkout = { month: true, year: true }) {
  return {
    authenticated: true,
    tier: "draft",
    planSource: "stripe",
    compUntil: null,
    hasStripeCustomer: false,
    renews: null,
    cancelAtEnd: false,
    billingState: "ok",
    priceDisplay: null,
    checkout,
  };
}

let container: HTMLDivElement;
let root: Root;

async function render(ui: React.ReactElement) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(ui); });
  // Let the mount effects (getUser → getBillingState) settle.
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

async function click(el: Element | null | undefined) {
  if (!el) throw new Error("element not found");
  await act(async () => { (el as HTMLElement).click(); });
}

const radio = (name: RegExp) =>
  Array.from(container.querySelectorAll('[role="radio"]')).find((b) => name.test(b.textContent || ""));
const button = (name: RegExp) =>
  Array.from(container.querySelectorAll("button")).find((b) => name.test(b.textContent || "")) as HTMLButtonElement | undefined;
const text = () => container.textContent || "";

beforeEach(() => {
  vi.clearAllMocks();
  // Same-document URL so jsdom can "navigate" to checkout.
  billing.createScribeCheckout.mockResolvedValue({ url: `${window.location.origin}/#stripe-checkout` });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("/pricing — Monthly / Yearly", () => {
  it("clicking Yearly shows A$70/year and checkout requests the yearly price", async () => {
    billing.getBillingState.mockResolvedValue(draftState());
    await render(<PricingView />);
    expect(text()).toContain("A$7/month");

    await click(radio(/Yearly/));
    expect(radio(/Yearly/)?.getAttribute("aria-checked")).toBe("true");
    expect(radio(/Monthly/)?.getAttribute("aria-checked")).toBe("false");
    expect(text()).toContain("A$70/year");

    await click(button(/Upgrade to Scribe/));
    expect(billing.createScribeCheckout).toHaveBeenCalledTimes(1);
    expect(billing.createScribeCheckout).toHaveBeenCalledWith("year");
  });

  it("Monthly (the default) requests the monthly price", async () => {
    billing.getBillingState.mockResolvedValue(draftState());
    await render(<PricingView />);
    await click(button(/Upgrade to Scribe/));
    expect(billing.createScribeCheckout).toHaveBeenCalledWith("month");
  });

  it("switching back to Monthly after Yearly requests monthly", async () => {
    billing.getBillingState.mockResolvedValue(draftState());
    await render(<PricingView />);
    await click(radio(/Yearly/));
    await click(radio(/Monthly/));
    expect(text()).toContain("A$7/month");
    await click(button(/Upgrade to Scribe/));
    expect(billing.createScribeCheckout).toHaveBeenCalledWith("month");
  });

  it("yearly price not configured (the production bug): Yearly still selects and says why it can't be bought", async () => {
    billing.getBillingState.mockResolvedValue(draftState({ month: true, year: false }));
    await render(<PricingView />);

    const yearly = radio(/Yearly/) as HTMLButtonElement;
    expect(yearly.disabled).toBe(false);
    await click(yearly);
    expect(yearly.getAttribute("aria-checked")).toBe("true");
    expect(text()).toContain("A$70/year");
    expect(text()).toContain("Yearly billing isn’t available right now");
    expect(button(/Upgrade to Scribe/)?.disabled).toBe(true);
    expect(billing.createScribeCheckout).not.toHaveBeenCalled();
  });
});

describe("Settings → Plan & usage — Monthly / Yearly", () => {
  it("clicking Yearly shows A$70/year and checkout requests the yearly price", async () => {
    billing.getBillingState.mockResolvedValue(draftState());
    await render(<BillingSection />);

    await click(radio(/Yearly/));
    expect(radio(/Yearly/)?.getAttribute("aria-checked")).toBe("true");
    expect(text()).toContain("A$70/year");

    await click(button(/Upgrade to Scribe/));
    expect(billing.createScribeCheckout).toHaveBeenCalledWith("year");
  });

  it("yearly price not configured: Yearly still selects, Upgrade explains instead of failing", async () => {
    billing.getBillingState.mockResolvedValue(draftState({ month: true, year: false }));
    await render(<BillingSection />);
    await click(radio(/Yearly/));
    expect(text()).toContain("A$70/year");
    expect(text()).toContain("Yearly billing isn’t available right now");
    expect(button(/Upgrade to Scribe/)?.disabled).toBe(true);
  });
});
