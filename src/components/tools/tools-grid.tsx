"use client";

import React from "react";
import Link from "next/link";
import { IconArrowRight } from "@tabler/icons-react";
import { liveTools, comingSoonTools, type ToolMeta } from "@/lib/text-tools/registry";
import ToolsChrome from "@/components/tools/tools-chrome";
import ToolsFooter from "@/components/tools/tools-footer";

// Tools landing grid (spec §3). Public — rail stays, no notes sidebar.

function Tile({ tool, muted }: { tool: ToolMeta; muted?: boolean }) {
  const font = tool.glyphFont === "editor" ? "font-[family-name:var(--font-editor)]" : "font-[family-name:var(--font-meta)]";
  return (
    <span
      className={`flex items-center justify-center shrink-0 ${
        muted
          ? "w-10 h-10 rounded-[var(--radius-9)] bg-[var(--color-raised-soft)] text-[var(--color-ink-4)]"
          : "w-11 h-11 rounded-[var(--radius-10)] bg-[var(--color-accent-tint)] border border-[var(--color-accent-tint-border)] text-[var(--color-accent-text)]"
      } ${font} text-[14px] font-medium`}
    >
      {tool.glyph}
    </span>
  );
}

export default function ToolsGrid() {
  const live = liveTools();
  const soon = comingSoonTools();

  return (
    <ToolsChrome>
      <div className="mx-auto max-w-[1040px] px-6 md:px-10 py-[52px] pb-16">
        {/* Header */}
        <h1 className="font-[family-name:var(--font-editor)] text-[42px] leading-[1.05] font-medium tracking-[-0.018em] text-[var(--color-ink)]">
          Tools
        </h1>
        <p className="mt-2.5 max-w-[600px] text-[16px] leading-[1.6] text-[var(--color-ink-3)]">
          Small, free utilities for anyone who writes for the web. You don&apos;t need an account,
          and your text stays on your device.
        </p>

        {/* Available tools */}
        <div className="mt-9 grid grid-cols-1 min-[700px]:grid-cols-2 min-[1100px]:grid-cols-3 gap-[18px]">
          {live.map((tool) => (
            <Link
              key={tool.slug}
              href={`/tools/${tool.slug}`}
              className="group flex flex-col gap-4 p-[22px] rounded-[var(--radius-12)] bg-[var(--color-panel-alt)] border border-[var(--color-hairline)] hover:bg-[var(--color-raised-soft)] hover:border-[var(--color-border-control-strong)] transition-colors"
            >
              <Tile tool={tool} />
              <div>
                <div className="text-[16px] font-semibold text-[var(--color-ink-1)]">{tool.name}</div>
                <p className="mt-1.5 text-[13.5px] leading-[1.55] text-[var(--color-ink-4)]">{tool.cardDescription}</p>
              </div>
              <span className="inline-flex items-center gap-1 text-[12.5px] text-[var(--color-accent-text)]">
                Open tool <IconArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
              </span>
            </Link>
          ))}
        </div>

        {/* Coming soon */}
        {soon.length > 0 && (
          <>
            <div className="mt-10 flex items-center gap-3">
              <span className="font-[family-name:var(--font-meta)] text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--color-ink-5)]">
                Coming soon
              </span>
              <span className="flex-1 h-px bg-[var(--color-hairline-soft)]" />
            </div>
            <div className="mt-4 grid grid-cols-1 min-[700px]:grid-cols-2 min-[1100px]:grid-cols-3 gap-[18px]">
              {soon.map((tool) => (
                <div
                  key={tool.slug}
                  aria-disabled="true"
                  // Mobile (§9): name-only rows. Tablet/desktop: full dashed card.
                  className="flex items-center gap-3 px-4 py-3 min-[700px]:flex-col min-[700px]:items-start min-[700px]:gap-4 min-[700px]:px-[22px] min-[700px]:py-5 rounded-[var(--radius-12)] border border-dashed border-[var(--color-border-control-strong)]"
                >
                  <div className="hidden min-[700px]:block">
                    <Tile tool={tool} muted />
                  </div>
                  <div>
                    <div className="text-[15px] font-semibold text-[var(--color-ink-3)]">{tool.name}</div>
                    <p className="hidden min-[700px]:block mt-1.5 text-[13px] leading-[1.5] text-[var(--color-ink-4)]">{tool.cardDescription}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Footer — "All tools" omitted on the grid itself */}
        <ToolsFooter allTools={false} />
      </div>
    </ToolsChrome>
  );
}
