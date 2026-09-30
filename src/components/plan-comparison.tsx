"use client";

import React from "react";
import { IconCheck, IconMinus } from "@tabler/icons-react";
import { COMPARISON_ROWS } from "@/lib/plans";

// The single Draft-vs-Scribe comparison table, generated from the plan config
// and shared by /pricing and Settings → Plan & Usage so the two never diverge.

function Cell({ value }: { value: string | boolean }) {
  if (typeof value === "boolean") {
    return value ? (
      <IconCheck size={15} className="mx-auto text-[var(--color-accent-text)]" />
    ) : (
      <IconMinus size={14} className="mx-auto text-[var(--color-ink-6)]" />
    );
  }
  return <span className="text-[12.5px] text-[var(--color-ink-2)]">{value}</span>;
}

export default function PlanComparison() {
  return (
    <div className="rounded-[var(--radius-9)] border border-[var(--color-hairline)] overflow-hidden">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-[var(--color-hairline-soft)]">
            <th className="px-4 py-2.5 text-[12px] font-medium text-[var(--color-ink-4)]">Feature</th>
            <th className="px-4 py-2.5 text-[12px] font-medium text-[var(--color-ink-4)] text-center w-[28%]">Draft</th>
            <th className="px-4 py-2.5 text-[12px] font-medium text-[var(--color-ink-1)] text-center w-[28%]">Scribe</th>
          </tr>
        </thead>
        <tbody>
          {COMPARISON_ROWS.map((row, i) => (
            <tr key={row.label} className={i % 2 ? "bg-[var(--color-raised-soft)]/40" : ""}>
              <td className="px-4 py-2.5 text-[12.5px] text-[var(--color-ink-2)]">{row.label}</td>
              <td className="px-4 py-2.5 text-center"><Cell value={row.draft} /></td>
              <td className="px-4 py-2.5 text-center"><Cell value={row.scribe} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
