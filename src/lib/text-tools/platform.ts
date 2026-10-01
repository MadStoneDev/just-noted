"use client";

import { useEffect, useState } from "react";

// True on Apple platforms. Safe to call only in the browser; returns false during
// SSR (navigator undefined), so pair with usePlatformMod() for anything rendered
// at mount to avoid a hydration mismatch.
export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
}

/**
 * OS-aware modifier label for shortcut hints: "Ctrl" on Windows/Linux, "⌘" on
 * Mac. Starts as "Ctrl" (matching server HTML) and corrects after mount, so
 * shortcut hints never cause a hydration mismatch.
 */
export function usePlatformMod(): { mod: string; copy: string; undo: string; redo: string } {
  const [mac, setMac] = useState(false);
  useEffect(() => { setMac(isMacPlatform()); }, []);
  const mod = mac ? "⌘" : "Ctrl";
  return {
    mod,
    copy: mac ? "⌘C" : "Ctrl+C",
    undo: mac ? "⌘Z" : "Ctrl+Z",
    redo: mac ? "⇧⌘Z" : "Ctrl+Shift+Z",
  };
}
