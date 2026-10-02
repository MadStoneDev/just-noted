"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { ThemeToggle } from "@/components/ds/theme-toggle";

// Tools footer (spec §4.7). Left: the same CTA line on every page. Right: "All
// tools" (omitted on the grid) and, for guests, the Light/Dark/System theme
// switch. Signed-in users set their theme in Settings, so the switch is hidden.
// No banners, popovers or modals anywhere in Tools.
export default function ToolsFooter({ allTools = true }: { allTools?: boolean }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    createClient().auth.getUser().then(({ data }) => {
      if (alive) setSignedIn(!!data.user);
    });
    return () => { alive = false; };
  }, []);

  return (
    <div className="mt-14 border-t border-[var(--color-hairline-soft)] pt-[18px] flex flex-wrap items-center justify-between gap-4">
      <p className="text-[13.5px] text-[var(--color-ink-3)]">
        Write without distractions in{" "}
        <Link href="/" className="text-[var(--color-accent-text)] hover:underline">
          JustNoted →
        </Link>
      </p>
      <div className="flex items-center gap-[18px]">
        {allTools && (
          <Link href="/tools" className="text-[12.5px] text-[var(--color-ink-3)] hover:text-[var(--color-ink-1)] transition-colors">
            All tools
          </Link>
        )}
        {signedIn === false && <ThemeToggle />}
      </div>
    </div>
  );
}
