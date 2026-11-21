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
// The re-serialisation is emitted as the editor mounts, with no user input
// behind it. So the load emission is "the first emission after (re)mount, for a
// note that loaded with content, BEFORE the editor's first real input event".
// Once the user has typed, pasted, dropped or pressed an editing key, any
// emission carries their edit and is persisted, however soon after mount it
// lands (a keystroke in the first second used to be adopted as the baseline
// and silently dropped). Edits applied by code on the user's behalf (toolbar,
// slash menu, link popover, task checkbox, version restore) report input the
// same way before they apply. The time window stays as an outer bound only.
// An empty (new) note has no stored content to re-serialise, so its first
// emission is a genuine keystroke and is always persisted.

export const LOAD_EMISSION_WINDOW_MS = 1000;

// Keys that move the caret or select without changing the text. Pressing one
// is not "real input" (the load emission may still be on its way).
const NON_EDITING_KEYS = new Set([
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown",
  "Shift", "Control", "Alt", "Meta", "AltGraph", "CapsLock", "NumLock", "ScrollLock",
  "Escape", "ContextMenu", "Fn", "Dead", "Unidentified",
]);

/** The DOM events isEditingInputEvent classifies (listen to these on the editor). */
export const EDITING_INPUT_EVENTS = ["beforeinput", "keydown", "paste", "drop", "cut", "compositionstart"] as const;

/**
 * True if a DOM event on the editor is the user changing the text (or about
 * to): typing, deleting, Enter, paste, drop, cut, IME composition, an editing
 * shortcut. Navigation keys, modifiers alone and F-keys are not. Copy (Mod-c)
 * and select-all (Mod-a) are not either.
 */
export function isEditingInputEvent(e: { type: string; key?: string; ctrlKey?: boolean; metaKey?: boolean }): boolean {
  switch (e.type) {
    case "beforeinput":
    case "paste":
    case "drop":
    case "cut":
    case "compositionstart":
      return true;
    case "keydown": {
      const key = e.key ?? "";
      if (NON_EDITING_KEYS.has(key) || /^F\d{1,2}$/.test(key)) return false;
      if ((e.ctrlKey || e.metaKey) && (key === "c" || key === "C" || key === "a" || key === "A")) return false;
      return true;
    }
    default:
      return false;
  }
}

export interface EditorChangeInput {
  /** The Markdown the editor just emitted. */
  value: string;
  /** The last content we consider saved (the clean baseline). */
  baseline: string;
  /** True if this is the first emission since the editor (re)mounted with non-empty content. */
  awaitingLoadEmission: boolean;
  /** True once the editor has seen a real input event since it (re)mounted (see isEditingInputEvent). */
  userInputSinceMount: boolean;
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
  /**
   * The text is back to exactly the saved baseline (e.g. a character typed and
   * deleted). Nothing to save, and any save still pending for the undone edit
   * must be dropped so the status settles and the edit can't come back.
   */
  backToBaseline: boolean;
}

export function decideEditorChange(input: EditorChangeInput): EditorChangeDecision {
  const { value, baseline, awaitingLoadEmission, userInputSinceMount, msSinceMount } = input;
  const windowMs = input.windowMs ?? LOAD_EMISSION_WINDOW_MS;

  // The load re-serialisation: first emission right after mount of a loaded
  // note, with no user input behind it. Adopt it as the baseline so opening a
  // note is never an edit.
  if (awaitingLoadEmission && !userInputSinceMount && msSinceMount >= 0 && msSinceMount < windowMs) {
    return { adoptBaseline: true, persist: false, backToBaseline: false };
  }

  // Unchanged from the baseline: nothing to save (and nothing still pending).
  if (value === baseline) {
    return { adoptBaseline: false, persist: false, backToBaseline: true };
  }

  // A real edit.
  return { adoptBaseline: false, persist: true, backToBaseline: false };
}
