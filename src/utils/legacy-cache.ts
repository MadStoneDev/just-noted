// One-time handling of IndexedDB cache records written by builds before the
// `localEdit` flag existed (see CombinedNote.localEdit, reconcileNotes).
//
// Those records carry no flag at all, so on this device's first load of the new
// build an unflagged copy may be an edit the old build never got to the server.
// reconcileNotes keeps such a copy as a "(conflicted copy)" when it is newer
// than the server; once a source has been checked on this device, the marker
// below is set and the flag rules alone apply from then on.

import { v5 as uuidv5 } from "uuid";
import type { CombinedNote, NoteSource } from "@/types/combined-notes";

const MARKER_PREFIX = "jn_localedit_cache_v1:";
const SOURCES: NoteSource[] = ["redis", "supabase"];

/**
 * Base version for a legacy copy's write. Versions start at 1, so the server is
 * never "still at base" and always keeps its note, saving ours as a copy (or
 * doing nothing if it already holds the same text). A legacy record's own
 * version can't be trusted as its base: the old build cached text against
 * whatever version it last saw.
 */
export const LEGACY_COPY_BASE_VERSION = 0;

// Fixed namespace for the copy ids below (any constant UUID works).
const COPY_ID_NAMESPACE = "6c2f7e1a-4b8d-4c55-9a43-2f0d8e6b1c37";

/**
 * The copy's id, fixed per cached record: two tabs loading at once, or a retry
 * on the next load, make ONE copy (the server ignores a copy id it already has).
 */
export function legacyCopyId(note: Pick<CombinedNote, "id" | "updatedAt">): string {
  return uuidv5(`${note.id}:${note.updatedAt}`, COPY_ID_NAMESPACE);
}

/** Sources this device hasn't checked its pre-flag cache for yet. */
export function legacyCacheSourcesPending(): Set<NoteSource> {
  const pending = new Set<NoteSource>();
  for (const s of SOURCES) {
    try {
      if (!localStorage.getItem(MARKER_PREFIX + s)) pending.add(s);
    } catch {
      // No storage: no marker can ever be set, and treating every load as the
      // first would keep re-deciding on stale caches. Flag rules only.
    }
  }
  return pending;
}

/** This source's cache has been checked on this build: flag rules from now on. */
export function markLegacyCacheChecked(source: NoteSource): void {
  try {
    localStorage.setItem(MARKER_PREFIX + source, String(Date.now()));
  } catch {}
}
