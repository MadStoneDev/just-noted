// Decides whether an editor `onChange` emission is a real user edit that must be
// persisted, or the editor's own re-serialisation of the stored content right
// after a note loads (which must NOT count as an edit).
//
// Why this exists: Milkdown parses the stored Markdown into its document model
// on mount, then serialises it back. That round-trip can change the bytes
// (escaping, list markers, whitespace, trailing newline) without changing
// meaning, and it emits the result through `onChange`. If we treated that first
// emission as an edit, merely opening a note would autosave — bumping
// updated_at, writing a version snapshot, and showing "just now" in the sidebar
// without the user typing a thing.
//
// The re-serialisation is emitted synchronously as the editor mounts, long
// before a human could focus the note and type, so "first emission, within a
// short window of (re)mount, for a note that loaded with content" reliably
// identifies it. An empty (new) note has no stored content to re-serialise, so
// its first emission is a genuine keystroke and is always persisted.

export const LOAD_EMISSION_WINDOW_MS = 1000;

export interface EditorChangeInput {
  /** The Markdown the editor just emitted. */
  value: string;
  /** The last content we consider saved (the clean baseline). */
  baseline: string;
  /** True if this is the first emission since the editor (re)mounted with non-empty content. */
  awaitingLoadEmission: boolean;
  /** Milliseconds since the editor (re)mounted. */
  msSinceMount: number;
  /** Override the mount window (mainly for tests). */
  windowMs?: number;
}

export interface EditorChangeDecision {
  /** Adopt `value` as the new clean baseline (do not save, do not snapshot). */
  adoptBaseline: boolean;
  /** Persist this change (local + debounced cloud save). */
  persist: boolean;
}

export function decideEditorChange(input: EditorChangeInput): EditorChangeDecision {
  const { value, baseline, awaitingLoadEmission, msSinceMount } = input;
  const windowMs = input.windowMs ?? LOAD_EMISSION_WINDOW_MS;

  // The load re-serialisation: first emission right after mount of a loaded
  // note. Adopt it as the baseline so opening a note is never an edit.
  if (awaitingLoadEmission && msSinceMount >= 0 && msSinceMount < windowMs) {
    return { adoptBaseline: true, persist: false };
  }

  // Unchanged from the baseline — nothing to do.
  if (value === baseline) {
    return { adoptBaseline: false, persist: false };
  }

  // A real edit.
  return { adoptBaseline: false, persist: true };
}
