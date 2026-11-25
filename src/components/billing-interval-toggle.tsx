"use client";

import React from "react";
import { PLANS, type BillingInterval } from "@/lib/plans";

// Monthly / Yearly choice for Scribe, shown wherever an upgrade starts. The
// interval is chosen at checkout only (no switching in the billing portal).
//
// Never disabled: picking an interval only changes the price shown. Whether
// that interval can be bought is the Upgrade button's job (it explains when it
// can't), so a missing price id is visible instead of a dead toggle.
export default function BillingIntervalToggle({
  value,
  onChange,
}: {
  value: BillingInterval;
  onChange: (v: BillingInterval) => void;
}) {
  const savings = PLANS.scribe.price.yearly?.savingsNote;
  const options: { id: BillingInterval; label: string; note?: string }[] = [
    { id: "month", label: "Monthly" },
    { id: "year", label: "Yearly", note: savings },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Billing period"
      className="inline-flex p-0.5 rounded-[var(--radius-7)] border border-[var(--color-hairline)] bg-[var(--color-canvas)]"
    >
      {options.map((o) => {
        const selected = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.id)}
            className={`h-7 px-2.5 rounded-[var(--radius-6)] text-[12px] font-medium transition-colors ${
              selected
                ? "bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)]"
                : "text-[var(--color-ink-3)] hover:text-[var(--color-ink-1)]"
            }`}
          >
            {o.label}
            {o.note && (
              <span className={`ml-1 text-[10.5px] ${selected ? "opacity-90" : "text-[var(--color-accent-text)]"}`}>
                · {o.note}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
