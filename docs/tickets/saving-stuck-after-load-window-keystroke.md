# "Saving…" stuck after a keystroke in the 1-second load window

- **Status:** open, not fixed (logged 2026-11-21, branch `prelaunch/playwright-and-b7`)
- **Severity:** low. The status line is wrong, but the server already holds the text on screen in the reported case. A related case may lose a keystroke (see below; not verified).
- **Area:** editor save status. `src/components/active-note-editor.tsx`, `src/utils/editor-save-decision.ts`, `src/hooks/use-auto-save.tsx`

## Symptom

A note with stored content is opened. The user's first keystroke lands within
1 s of the editor mounting. A later edit returns the note to its stored content
(for example, typing a character and deleting it). The status line then shows
"Saving…" and stays that way. No save goes out, and the state only clears on the
next edit that differs from the stored content.

## Repro (expected)

1. Open a note that has text.
2. Within 1 s of the editor mounting, type one character.
3. Wait more than 1 s, then delete that character so the text equals the stored content again.
4. The status shows "Saving…" indefinitely.

## Likely cause (from reading the code, not yet confirmed in a test)

Two separate "last saved" baselines disagree:

- `decideEditorChange` treats the first emission within
  `LOAD_EMISSION_WINDOW_MS` (1000 ms) of mount as the editor's load
  re-serialisation. `handleContentChange` then sets the editor's
  `lastSavedContentRef` to that value, which here is the user's first keystroke.
  That value is not saved, and `saveState` stays "clean".
- `useAutoSave` keeps its own `lastSavedContentRef`, set to the stored note
  content (`use-auto-save.tsx:28`), and that baseline is not moved.
- The edit back to the stored content differs from the editor's baseline, so it
  counts as a real edit: `setSaveState("dirty")` plus `debouncedSave()`.
  `useAutoSave` sees content equal to *its* baseline and returns early
  (`use-auto-save.tsx:54`). So `saveContent` never runs, and nothing sets
  `saveState` back to "clean".

## Related, worth checking alongside

Same root cause, worse outcome: if the user types only that first in-window
keystroke and stops, the editor adopts it as the clean baseline. It is never
persisted, so the IDB write-ahead copy and the save are both skipped, and closing
the tab drops it, because `onLeaving` compares against the editor's baseline.
Not verified.

## Fix directions (not decided)

- Only adopt the first emission as the baseline when it is a pure
  re-serialisation (normalised-equal to the stored content). Anything else is
  an edit.
- And/or keep one baseline: have the editor tell `useAutoSave` when it adopts
  one, or derive "dirty" from the same ref the autosave compares against.
- Add a unit test on `decideEditorChange` plus an E2E test: type within 1 s of
  open, revert, and expect the status to settle to Saved/Synced.
