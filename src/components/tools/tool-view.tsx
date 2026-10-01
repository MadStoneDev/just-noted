"use client";

import React from "react";
import { IconChevronLeft, IconDeviceDesktop } from "@tabler/icons-react";
import { getTool } from "@/lib/text-tools/registry";
import SlugGenerator from "@/components/tools/slug-generator";
import CaseConverter from "@/components/tools/case-converter";

// Renders a single tool (route /tools/:slug): shared chrome (header, how-it-works,
// the privacy line and a quiet link home) around the tool's interactive UI.
export default function ToolView({
  slug,
  onBack,
}: {
  slug: string;
  onBack: () => void;
}) {
  const tool = getTool(slug);

  if (!tool) {
    return (
      <div className="flex-1 overflow-y-auto scrollbar-thin bg-[var(--color-canvas)]">
        <div className="mx-auto max-w-[760px] px-6 md:px-10 py-10">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1 text-[13px] text-[var(--color-ink-3)] hover:text-[var(--color-ink-1)] transition-colors"
          >
            <IconChevronLeft size={16} /> Tools
          </button>
          <p className="mt-8 text-[14px] text-[var(--color-ink-4)]">That tool doesn’t exist.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin bg-[var(--color-canvas)]">
      <div className="mx-auto max-w-[760px] px-6 md:px-10 py-8">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 h-8 -ml-1 text-[13px] text-[var(--color-ink-3)] hover:text-[var(--color-ink-1)] transition-colors"
        >
          <IconChevronLeft size={16} /> Tools
        </button>

        <h1 className="mt-2 font-[family-name:var(--font-editor)] text-[30px] leading-[1.08] font-medium tracking-[-0.01em] text-[var(--color-ink)]">
          {tool.name}
        </h1>
        <p className="mt-1.5 text-[13.5px] text-[var(--color-ink-5)]">{tool.tagline}</p>

        {/* Interactive tool */}
        <div className="mt-6">
          {slug === "slug-generator" && <SlugGenerator />}
          {slug === "case-converter" && <CaseConverter />}
        </div>

        {/* Privacy line */}
        <div className="mt-8 flex items-center gap-2 text-[12.5px] text-[var(--color-ink-4)]">
          <IconDeviceDesktop size={15} className="shrink-0 text-[var(--color-ink-5)]" />
          Your text never leaves your device — everything runs locally in your browser.
        </div>

        {/* How it works */}
        <div className="mt-8">
          <h2 className="text-[11px] font-[family-name:var(--font-meta)] uppercase tracking-wider text-[var(--color-ink-5)] mb-2">
            How it works
          </h2>
          <ul className="space-y-1.5">
            {tool.howItWorks.map((line, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-[1.55] text-[var(--color-ink-3)]">
                <span className="text-[var(--color-ink-6)]">{i + 1}.</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Quiet link home */}
        <div className="mt-8 pt-5 border-t border-[var(--color-hairline-soft)] text-[12.5px] text-[var(--color-ink-5)]">
          A free tool from{" "}
          <a href="/" className="text-[var(--color-accent-text)] hover:underline">
            JustNoted
          </a>{" "}
          — a distraction-free notes app.
        </div>
      </div>
    </div>
  );
}
