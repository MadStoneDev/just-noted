"use client";

import React from "react";
import { IconX } from "@tabler/icons-react";
import { ROADMAP, type RoadmapStatus } from "@/data/roadmap";

// Standalone Roadmap page (opened from the rail). Kanban board, read-only for
// now; content comes from the curated public list in src/data/roadmap.ts.
// Voting, suggestions and admin drag-to-reprioritise come in later phases (see
// docs/roadmap.md), at which point items move to Supabase.

type ColumnStatus = RoadmapStatus | "under-review";

const COLUMNS: { status: ColumnStatus; label: string; dot: string }[] = [
  { status: "under-review", label: "Under review", dot: "var(--color-ink-6)" },
  { status: "planned", label: "Planned", dot: "var(--color-ink-5)" },
  { status: "in-progress", label: "In progress", dot: "var(--color-accent-fill)" },
  { status: "shipped", label: "Shipped", dot: "#3DA35D" },
];

export default function RoadmapView({ onClose }: { onClose: () => void }) {
  const byStatus = new Map<string, { title: string; blurb: string }[]>();
  for (const g of ROADMAP) byStatus.set(g.status, g.items);

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin bg-[var(--color-canvas)]">
      <div className="mx-auto max-w-[1200px] px-6 md:px-10 py-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="font-[family-name:var(--font-editor)] text-[34px] leading-[1.05] font-medium tracking-[-0.01em] text-[var(--color-ink)]">
              Roadmap
            </h1>
            <p className="mt-1.5 text-[11.5px] font-[family-name:var(--font-meta)] text-[var(--color-ink-5)]">
              What we're building and what's shipped · voting &amp; suggestions coming soon
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close roadmap"
            className="flex items-center justify-center w-8 h-8 rounded-[var(--radius-7)] text-[var(--color-ink-4)] hover:bg-[var(--color-raised-soft)] hover:text-[var(--color-ink-1)] transition-colors"
          >
            <IconX size={16} />
          </button>
        </div>

        {/* Board */}
        <div className="flex gap-4 overflow-x-auto pb-4 -mx-1 px-1">
          {COLUMNS.map((col) => {
            const items = byStatus.get(col.status) || [];
            return (
              <div key={col.status} className="flex-1 min-w-[240px] max-w-[320px]">
                <div className="flex items-center gap-1.5 mb-2.5 px-1">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: col.dot }} />
                  <span className="text-[11px] font-[family-name:var(--font-meta)] uppercase tracking-[0.12em] text-[var(--color-ink-5)]">
                    {col.label}
                  </span>
                  <span className="text-[11px] font-[family-name:var(--font-meta)] text-[var(--color-ink-6)]">
                    {items.length}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {items.length === 0 ? (
                    <div className="rounded-[var(--radius-10)] border border-dashed border-[var(--color-hairline)] p-4 text-[12px] text-[var(--color-ink-6)]">
                      Nothing here yet.
                    </div>
                  ) : (
                    items.map((it, i) => (
                      <div
                        key={i}
                        className="rounded-[var(--radius-10)] border border-[var(--color-hairline)] bg-[var(--color-panel-alt)] p-3"
                      >
                        <div className="text-[13.5px] font-medium text-[var(--color-ink-1)]">{it.title}</div>
                        <div className="mt-1 text-[12px] leading-[1.5] text-[var(--color-ink-4)]">{it.blurb}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
