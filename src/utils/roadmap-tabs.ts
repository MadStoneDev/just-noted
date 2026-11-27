// Pure helpers for the roadmap's phone tab bar (src/components/roadmap-view.tsx).

/**
 * Which list the phone view opens on: the preferred one (In progress) when it
 * has items, otherwise the first list that has any, otherwise the preferred one.
 */
export function defaultRoadmapTab(counts: number[], preferred: number): number {
  if ((counts[preferred] ?? 0) > 0) return preferred;
  const first = counts.findIndex((n) => n > 0);
  return first === -1 ? preferred : first;
}

/**
 * Roving-focus target for a key pressed on tab `current` of `total`, following
 * the WAI-ARIA tabs pattern (horizontal: arrows wrap, Home/End jump). Null when
 * the key isn't a tab-navigation key.
 */
export function nextTabIndex(key: string, current: number, total: number): number | null {
  switch (key) {
    case "ArrowRight":
      return (current + 1) % total;
    case "ArrowLeft":
      return (current - 1 + total) % total;
    case "Home":
      return 0;
    case "End":
      return total - 1;
    default:
      return null;
  }
}

/** The snap panel nearest a horizontal scroll offset, clamped to the list range. */
export function panelIndexAt(scrollLeft: number, panelWidth: number, total: number): number {
  if (panelWidth <= 0) return 0;
  return Math.max(0, Math.min(total - 1, Math.round(scrollLeft / panelWidth)));
}
