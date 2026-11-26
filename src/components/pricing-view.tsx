"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconX, IconCheck, IconSparkles } from "@tabler/icons-react";
import { createClient } from "@/utils/supabase/client";
import { PLANS, scribePriceDisplay, type PlanTier, type Plan, type BillingInterval } from "@/lib/plans";
import { type BillingState } from "@/lib/subscription";
import { openUpgradeCheckout } from "@/lib/billing-client";
import { getPortalUrl, getBillingState } from "@/app/actions/billingActions";
import { useToast } from "@/components/ui/toast";
import PlanComparison from "@/components/plan-comparison";
import BillingIntervalToggle from "@/components/billing-interval-toggle";

// Public pricing page (design: same shell as Roadmap — the rail stays, this
// fills the rest). Everything renders from the single plan config so it can
// never drift from what's actually enforced.

export default function PricingView() {
  const router = useRouter();
  const onClose = () => router.push("/");
  const { showError, showSuccess } = useToast();
  const [tier, setTier] = useState<PlanTier | null>(null);
  const [billingState, setBillingState] = useState<BillingState>("ok");
  const [authed, setAuthed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [interval, setBillingInterval] = useState<BillingInterval>("month");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  // Which intervals can be bought; assume both until the server says otherwise.
  const [checkout, setCheckout] = useState<Record<BillingInterval, boolean>>({ month: true, year: true });

  useEffect(() => {
    let alive = true;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const state = await getBillingState();
      if (!alive) return;
      setCheckout(state.checkout);
      if (!state.checkout.month && state.checkout.year) setBillingInterval("year");
      if (!user || !state.authenticated) return;
      setAuthed(true);
      setTier(state.tier);
      setBillingState(state.billingState);
    })();
    return () => { alive = false; };
  }, []);

  // Back from Stripe Checkout (?checkout=success). Read once on mount; the
  // page is statically rendered, so no useSearchParams/Suspense needed.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("checkout") === "success") {
      showSuccess("Welcome to Scribe. It can take a few seconds to switch on.");
    }
  }, []);
  // Coming back from Stripe with the Back button restores this page from the
  // bfcache with the button still "Opening checkout…"; reset it.
  useEffect(() => {
    const reset = () => setCheckoutBusy(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  const upgrade = async () => {
    if (!authed) { window.location.href = "/get-access"; return; }
    setCheckoutBusy(true);
    const err = await openUpgradeCheckout(interval);
    if (err) { setCheckoutBusy(false); showError(err); }
  };
  const checkoutConfigured = checkout.month || checkout.year;
  // The chosen period can't be bought (its price isn't configured) while the
  // other one can: say so rather than starting a checkout that will fail.
  const intervalUnavailable = checkoutConfigured && !checkout[interval];

  const manage = async () => {
    setBusy(true);
    const url = await getPortalUrl();
    setBusy(false);
    if (url) window.open(url, "_blank");
    else showError("Couldn’t open the billing portal.");
  };

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin bg-[var(--color-canvas)]">
      <div className="mx-auto max-w-[980px] px-6 md:px-10 py-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="font-[family-name:var(--font-editor)] text-[34px] leading-[1.05] font-medium tracking-[-0.01em] text-[var(--color-ink)]">
              Plans
            </h1>
            <p className="mt-1.5 text-[13px] text-[var(--color-ink-5)]">
              Note-taking stays free. Upgrade to Scribe when you want to share notes others can edit.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close pricing"
            className="flex items-center justify-center w-8 h-8 rounded-[var(--radius-7)] text-[var(--color-ink-4)] hover:bg-[var(--color-raised-soft)] hover:text-[var(--color-ink-1)] transition-colors shrink-0"
          >
            <IconX size={16} />
          </button>
        </div>

        {/* Plan cards */}
        <div className="grid gap-4 sm:grid-cols-2">
          {(Object.values(PLANS) as Plan[]).map((plan) => {
            const isCurrent = tier === plan.id;
            const isScribe = plan.id === "scribe";
            return (
              <div
                key={plan.id}
                className={`rounded-[var(--radius-9)] border p-5 flex flex-col ${
                  isScribe
                    ? "border-[var(--color-accent-tint-border)] bg-[var(--color-accent-tint)]"
                    : "border-[var(--color-hairline)]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-semibold text-[var(--color-ink-1)]">{plan.label}</span>
                  {isCurrent && (
                    <span className="text-label font-[family-name:var(--font-meta)] px-1.5 py-0.5 rounded-[var(--radius-5)] border border-[var(--color-hairline)] text-[var(--color-ink-4)]">
                      Current
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-[26px] font-semibold text-[var(--color-ink)]">
                    {isScribe ? scribePriceDisplay(interval) : plan.price.display}
                  </span>
                </div>
                {isScribe && !isCurrent && (
                  <div className="mt-2">
                    <BillingIntervalToggle value={interval} onChange={setBillingInterval} />
                  </div>
                )}
                {plan.price.gstNote && (
                  <p className="mt-1 text-meta text-[var(--color-ink-5)]">{plan.price.gstNote}</p>
                )}

                <ul className="mt-4 space-y-1.5 flex-1">
                  {plan.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-1.5 text-[12.5px] text-[var(--color-ink-2)]">
                      <IconCheck size={13} className="mt-0.5 shrink-0 text-[var(--color-accent-text)]" />
                      {h}
                    </li>
                  ))}
                </ul>

                <div className="mt-5">
                  {isScribe ? (
                    isCurrent ? (
                      billingState === "manual" ? (
                        <div className="h-9 flex items-center justify-center text-[12px] text-[var(--color-accent-text)]">
                          Complimentary
                        </div>
                      ) : billingState === "billing_issue" ? (
                        <a
                          href="/contact"
                          className="w-full h-9 flex items-center justify-center rounded-[var(--radius-7)] text-[13px] font-medium border border-[var(--color-border-control)] text-[var(--color-ink-2)] hover:bg-[var(--color-raised-soft)] transition-colors"
                        >
                          Contact support
                        </a>
                      ) : (
                        <button
                          onClick={manage}
                          disabled={busy}
                          className="w-full h-9 rounded-[var(--radius-7)] text-[13px] font-medium border border-[var(--color-border-control)] text-[var(--color-ink-2)] hover:bg-[var(--color-raised-soft)] transition-colors disabled:opacity-50"
                        >
                          {busy ? "Opening…" : "Manage billing"}
                        </button>
                      )
                    ) : (
                      <button
                        onClick={upgrade}
                        disabled={checkoutBusy || intervalUnavailable}
                        className="w-full h-9 rounded-[var(--radius-7)] text-[13px] font-semibold bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)] hover:opacity-90 transition-opacity disabled:opacity-60"
                      >
                        {checkoutBusy ? "Opening checkout…" : "Upgrade to Scribe"}
                      </button>
                    )
                  ) : isCurrent ? (
                    <div className="h-9 flex items-center justify-center text-[12px] text-[var(--color-ink-5)]">
                      You’re on Draft
                    </div>
                  ) : (
                    <a
                      href="/get-access"
                      className="w-full h-9 flex items-center justify-center rounded-[var(--radius-7)] text-[13px] font-medium border border-[var(--color-border-control)] text-[var(--color-ink-2)] hover:bg-[var(--color-raised-soft)] transition-colors"
                    >
                      Start free
                    </a>
                  )}
                </div>
                {isScribe && !isCurrent && intervalUnavailable && (
                  <p className="mt-2 text-meta text-[var(--color-ink-5)]">
                    {interval === "year" ? "Yearly" : "Monthly"} billing isn’t available right now. Choose{" "}
                    {interval === "year" ? "Monthly" : "Yearly"} or try again later.
                  </p>
                )}
                {isScribe && !isCurrent && !checkoutConfigured && (
                  <p className="mt-2 text-meta text-[var(--color-ink-5)]">
                    Checkout is being set up. The button goes live once billing is configured.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Comparison table */}
        <div className="mt-10">
          <div className="mb-2 text-label font-[family-name:var(--font-meta)] uppercase tracking-wider text-[var(--color-ink-5)]">
            Compare
          </div>
          <PlanComparison />
        </div>

        {/* FAQ */}
        <div className="mt-10 space-y-5 max-w-[640px]">
          <div className="flex items-center gap-1.5 text-label font-[family-name:var(--font-meta)] uppercase tracking-wider text-[var(--color-ink-5)]">
            <IconSparkles size={12} /> Good to know
          </div>
          {[
            {
              q: "Monthly or yearly?",
              a: `Pay ${PLANS.scribe.price.display}, or ${PLANS.scribe.price.yearly?.display} for the year (two months free). You choose when you upgrade.`,
            },
            {
              q: "Can I cancel anytime?",
              a: "Yes. Cancel from the billing portal and you stay on Scribe until the end of your paid period, then move back to Draft.",
            },
            {
              q: "What happens when I go back to Draft?",
              a: "Nothing is deleted. Your notebooks stay (you just can’t create new ones past 10). People you shared notes with for editing become view-only. Your version history is kept and trims back toward 50 per note over time. Trash keeps a 30-day window from your downgrade date.",
            },
            {
              q: "Are my notes ever locked behind a paywall?",
              a: "No. Writing and keeping notes, including local notes on your device, is always free.",
            },
            {
              q: "Is GST included?",
              a: "No GST is charged. RAVENCI Solutions isn’t registered for GST. Prices are in Australian dollars (AUD).",
            },
          ].map((f) => (
            <div key={f.q}>
              <p className="text-[13px] font-medium text-[var(--color-ink-1)]">{f.q}</p>
              <p className="mt-1 text-[12.5px] leading-[1.55] text-[var(--color-ink-4)]">{f.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
