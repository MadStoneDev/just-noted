// Keyboard note switching (Ctrl/Cmd+Alt+↑/↓, Ctrl/Cmd+Alt+0–9) — E1.
//
// After a switch the new note's editor body takes focus with the caret at the
// end, so the user can type at once. Two rules keep that from being intrusive:
//   1. While a modal overlay is open (search, command palette, any dialog) the
//      shortcut is ignored entirely — the overlay owns the keyboard.
//   2. If focus sits in a text field OUTSIDE the note editor (e.g. a sidebar
//      filter), the note still switches but focus stays in that field.
// Focusing is selection-only and never edits content ("open never edits").

export interface NoteSwitchContext {
  /** A `[aria-modal="true"]` overlay is currently in the DOM. */
  modalOpen: boolean;
  /** document.activeElement is an input / textarea / select / contenteditable. */
  activeIsTextField: boolean;
  /** document.activeElement sits inside the main note-editor region. */
  activeInEditorRegion: boolean;
}

export interface NoteSwitchDecision {
  /** Run the switch at all (and preventDefault the key). */
  handle: boolean;
  /** Move focus into the new note's editor body afterwards. */
  focusEditor: boolean;
}

export function decideNoteSwitch(ctx: NoteSwitchContext): NoteSwitchDecision {
  if (ctx.modalOpen) return { handle: false, focusEditor: false };
  const keepFocus = ctx.activeIsTextField && !ctx.activeInEditorRegion;
  return { handle: true, focusEditor: !keepFocus };
}

/** Read the live DOM into a NoteSwitchContext (browser only). */
export function readNoteSwitchContext(doc: Document = document): NoteSwitchContext {
  const el = doc.activeElement as HTMLElement | null;
  const tag = el?.tagName;
  const activeIsTextField =
    !!el && (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable);
  return {
    modalOpen: !!doc.querySelector('[aria-modal="true"]'),
    activeIsTextField,
    activeInEditorRegion: !!el?.closest("#main-content"),
  };
}
