// Server-side safety net for saves that remove most of a note's text.
//
// Before the server accepts a content save or a collab-doc save that leaves the
// note MORE THAN HALF shorter AND removes MORE THAN 200 characters, it
// snapshots the current body to Version history (reason "safety"), so a bad
// save — a client that wrote over the note from an empty editor, a stale doc —
// is always recoverable. Both conditions must hold: halving a short note is
// normal editing, and deleting 250 characters from a long note is too.
// Snapshots never block or alter the save itself.

export const SHRINK_MIN_REMOVED = 200;
export const SHRINK_MAX_RATIO = 0.5;

export function isMajorShrink(before: string | null | undefined, after: string | null | undefined): boolean {
  const b = (before ?? "").trim().length;
  const a = (after ?? "").trim().length;
  const removed = b - a;
  return removed > SHRINK_MIN_REMOVED && a < b * SHRINK_MAX_RATIO;
}
