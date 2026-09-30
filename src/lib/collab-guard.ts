// Guards for the shared-note collaboration write path.

/**
 * Would writing `incoming` blank a note that currently has content? The
 * collaborative editor can momentarily be empty (before the shared Yjs doc has
 * seeded), and its autosave must never project that emptiness over a note whose
 * stored content is non-empty. Whitespace-only counts as empty.
 */
export function wouldBlankNonEmpty(
  incoming: string | null | undefined,
  current: string | null | undefined,
): boolean {
  const incomingEmpty = !incoming || incoming.trim().length === 0;
  const currentNonEmpty = !!current && current.trim().length > 0;
  return incomingEmpty && currentNonEmpty;
}
