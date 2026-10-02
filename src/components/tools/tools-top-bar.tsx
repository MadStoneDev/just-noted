"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { getTool } from "@/lib/text-tools/registry";

// Tools shell top bar (spec §2.3): 52px, breadcrumb on the left; for guests,
// Sign in (ghost) + Try JustNoted free (outline). Signed-in users get an empty
// right side. Per the project override, "Try JustNoted free" links to the app
// itself ("/"), since guests can write without an account.
export default function ToolsTopBar() {
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (alive) setSignedIn(!!data.user);
    });
    return () => { alive = false; };
  }, []);

  const toolMatch = pathname.match(/^\/tools\/([^/]+)$/);
  const tool = toolMatch ? getTool(decodeURIComponent(toolMatch[1])) : null;

  return (
    <div className="flex items-center justify-between h-[52px] flex-none px-4 md:px-8 border-b border-[var(--color-hairline-soft)]">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="min-w-0 text-[12.5px] flex items-center gap-1.5">
        {tool ? (
          <>
            <Link href="/tools" className="text-[var(--color-ink-3)] hover:text-[var(--color-ink-1)] transition-colors">
              Tools
            </Link>
            <span className="text-[var(--color-ink-5)]">/</span>
            <span className="min-w-0 truncate text-[var(--color-ink-1)]">{tool.name}</span>
          </>
        ) : (
          <span className="text-[var(--color-ink-1)]">Tools</span>
        )}
      </nav>

      {/* Guest actions (signed-in: empty). Render nothing until auth resolves to
          avoid a flash of the guest buttons for signed-in users. */}
      {signedIn === false && (
        <div className="flex items-center gap-2 flex-none">
          <Link
            href="/get-access"
            className="inline-flex items-center h-11 min-[700px]:h-8 px-3 rounded-[var(--radius-7)] text-[12.5px] text-[var(--color-ink-3)] hover:text-[var(--color-ink-1)] hover:bg-[var(--color-raised-soft)] transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/"
            className="inline-flex items-center h-11 min-[700px]:h-8 px-3 rounded-[var(--radius-7)] text-[12.5px] text-[var(--color-ink)] border border-[var(--color-border-control-strong)] hover:bg-[var(--color-raised-soft)] transition-colors"
          >
            Try JustNoted free
          </Link>
        </div>
      )}
    </div>
  );
}
