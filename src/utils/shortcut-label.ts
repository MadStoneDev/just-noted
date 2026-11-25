// src/utils/shortcut-label.ts
// Shortcut hints in the platform's own notation: "⌘" on Mac (Apple's order
// and symbols, run together: ⇧⌘S), "Ctrl" elsewhere (Ctrl+Shift+S).
// Write keys with "Mod" for the primary modifier (⌘ / Ctrl).

"use client";

import { useEffect, useState } from "react";
import { isMacPlatform } from "@/lib/text-tools/platform";

const MAC_SYMBOL: Record<string, string> = { Ctrl: "⌃", Alt: "⌥", Shift: "⇧", Mod: "⌘" };
// Apple's modifier order: Control, Option, Shift, Command.
const MAC_ORDER = ["Ctrl", "Alt", "Shift", "Mod"];
const PC_ORDER = ["Mod", "Ctrl", "Alt", "Shift"];

/** Keys as separate labels (for <kbd> chips): ["⇧", "⌘", "S"] / ["Ctrl", "Shift", "S"]. */
export function shortcutKeys(keys: string[], mac: boolean): string[] {
  const mods = keys.filter((k) => k in MAC_SYMBOL);
  const rest = keys.filter((k) => !(k in MAC_SYMBOL));
  if (mac) {
    return [...MAC_ORDER.filter((m) => mods.includes(m)).map((m) => MAC_SYMBOL[m]), ...rest];
  }
  const pc = PC_ORDER.filter((m) => mods.includes(m)).map((m) => (m === "Mod" ? "Ctrl" : m));
  return [...Array.from(new Set(pc)), ...rest];
}

/** One string: "⇧⌘S" on Mac, "Ctrl+Shift+S" elsewhere. */
export function formatShortcut(keys: string[], mac: boolean): string {
  const parts = shortcutKeys(keys, mac);
  return mac ? parts.join("") : parts.join("+");
}

/**
 * Hook form. Renders the non-Mac label first (matching the server HTML) and
 * switches after mount, so hints never cause a hydration mismatch.
 */
export function useShortcut(): { mac: boolean; sc: (...keys: string[]) => string; keys: (...keys: string[]) => string[] } {
  const [mac, setMac] = useState(false);
  useEffect(() => setMac(isMacPlatform()), []);
  return { mac, sc: (...k) => formatShortcut(k, mac), keys: (...k) => shortcutKeys(k, mac) };
}
