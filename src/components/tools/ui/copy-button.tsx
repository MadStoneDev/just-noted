"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { IconCopy, IconCheck } from "@tabler/icons-react";
import { isMacPlatform } from "@/lib/text-tools/platform";

// Shared Copy button (spec §5.1): filled accent primary, 4 states, fixed
// min-width so it doesn't resize when it flips to "Copied" (1.6s), aria-live
// announcement, and a clipboard fallback. No global copy shortcut — the button
// is always visible, and Ctrl+Shift+C is taken by Chrome DevTools on Windows.
export default function CopyButton({
  text,
  label = "Copy",
  disabled = false,
  className = "",
}: {
  text: string;
  label?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "fallback">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [live, setLive] = useState("");

  const doCopy = useCallback(async () => {
    if (!text) return;
    if (timer.current) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
      setLive("Copied to clipboard");
      timer.current = setTimeout(() => { setState("idle"); setLive(""); }, 1600);
    } catch {
      // Clipboard unavailable — tell the user to press the keys themselves.
      setState("fallback");
      setLive("");
      timer.current = setTimeout(() => setState("idle"), 3000);
    }
  }, [text]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copiedLabel = "Copied";
  // Computed at click time (client), so it's always correct for the user's OS.
  const fallbackLabel = isMacPlatform() ? "Press ⌘C" : "Press Ctrl+C";
  const shown = state === "copied" ? copiedLabel : state === "fallback" ? fallbackLabel : label;

  return (
    <>
      <button
        type="button"
        onClick={doCopy}
        disabled={disabled}
        // Fixed min width covers the longest label so the button never resizes.
        style={{ minWidth: "7.5rem" }}
        className={[
          "inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-[var(--radius-8)] text-[13.5px] font-semibold transition-colors",
          disabled
            ? "bg-[var(--color-raised-soft)] border border-[var(--color-hairline)] text-[var(--color-ink-6)] cursor-not-allowed"
            : state === "copied"
              ? "bg-[var(--color-accent-tint)] border border-[var(--color-accent-tint-border)] text-[var(--color-accent-text)]"
              : "bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)] hover:brightness-110",
          className,
        ].join(" ")}
      >
        {state === "copied" ? <IconCheck size={14} /> : <IconCopy size={14} />}
        {shown}
      </button>
      <span aria-live="polite" className="sr-only">{live}</span>
    </>
  );
}
