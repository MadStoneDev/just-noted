"use client";

import React from "react";
import Link from "next/link";

// Tools footer (spec §4.7). Left: the same CTA line on every page. Right: "All
// tools" (omitted on the grid) and, for guests, the Light/Dark/System theme
// switch (added in A4). No banners, popovers or modals anywhere in Tools.
export default function ToolsFooter({ allTools = true }: { allTools?: boolean }) {
  return (
    <div className="mt-14 border-t border-[var(--color-hairline-soft)] pt-[18px] flex items-center justify-between gap-4">
      <p className="text-[13.5px] text-[var(--color-ink-3)]">
        Write without distractions in{" "}
        <Link href="/" className="text-[var(--color-accent-text)] hover:underline">
          JustNoted →
        </Link>
      </p>
      {allTools && (
        <Link href="/tools" className="text-[12.5px] text-[var(--color-ink-3)] hover:text-[var(--color-ink-1)] transition-colors">
          All tools
        </Link>
      )}
    </div>
  );
}
