"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { IconCopy, IconCheck } from "@tabler/icons-react";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

// Shared Copy button (spec §5.1): filled accent primary, 4 states, fixed
// min-width so it doesn't resize when it flips to "Copied" (1.6s), aria-live
// announcement, clipboard fallback, and an optional ⌘⇧C / Ctrl+Shift+C global
// shortcut that copies the tool's output from anywhere on the page.
export default function CopyButton({
  text,
  label = "Copy",
  disabled = false,
  shortcut = false,
  className = "",
}: {
  text: string;
  label?: string;
  disabled?: boolean;
  shortcut?: boolean;
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

  useEffect(() => {
    if (!shortcut) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "c" || e.key === "C")) {
        e.preventDefault();
        void doCopy();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcut, doCopy]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copiedLabel = "Copied";
  const fallbackLabel = isMac ? "Press ⌘C" : "Press Ctrl+C";
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
