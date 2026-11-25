"use client";

import { useShortcut } from "@/utils/shortcut-label";

/** A shortcut hint in the platform's notation: ⇧⌘S on Mac, Ctrl+Shift+S elsewhere. Use "Mod" for ⌘/Ctrl. */
export function Shortcut({ keys }: { keys: string[] }) {
  const { sc } = useShortcut();
  return <>{sc(...keys)}</>;
}
