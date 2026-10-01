"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { IconX, IconArrowRight } from "@tabler/icons-react";
import { TOOLS } from "@/lib/text-tools/registry";

// Tools landing grid (route /tools). Public — rail stays, no notes sidebar.
export default function ToolsGrid() {
  const router = useRouter();
  const onOpenTool = (slug: string) => router.push(`/tools/${slug}`);
  const onClose = () => router.push("/");
  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin bg-[var(--color-canvas)]">
      <div className="mx-auto max-w-[980px] px-6 md:px-10 py-10">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="font-[family-name:var(--font-editor)] text-[34px] leading-[1.05] font-medium tracking-[-0.01em] text-[var(--color-ink)]">
              Tools
            </h1>
            <p className="mt-1.5 text-[13px] text-[var(--color-ink-5)]">
              Small, fast text utilities. Everything runs in your browser — your text never leaves your device.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close tools"
            className="flex items-center justify-center w-8 h-8 rounded-[var(--radius-7)] text-[var(--color-ink-4)] hover:bg-[var(--color-raised-soft)] hover:text-[var(--color-ink-1)] transition-colors shrink-0"
          >
            <IconX size={16} />
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {TOOLS.map((tool) => (
            <button
              key={tool.slug}
              onClick={() => onOpenTool(tool.slug)}
              className="group text-left rounded-[var(--radius-9)] border border-[var(--color-hairline)] p-5 hover:border-[var(--color-accent-tint-border)] hover:bg-[var(--color-raised-soft)] transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[15px] font-semibold text-[var(--color-ink-1)]">{tool.name}</span>
                <IconArrowRight size={16} className="text-[var(--color-ink-5)] group-hover:text-[var(--color-accent-text)] transition-colors" />
              </div>
              <p className="mt-1.5 text-[13px] leading-[1.5] text-[var(--color-ink-4)]">{tool.tagline}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
