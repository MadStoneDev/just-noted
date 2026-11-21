# "Saving…" stuck after a keystroke in the 1-second load window

- **Status:** fixed 2026-11-21 on `prelaunch/playwright-and-b7` (see Resolution)
- **Severity:** blocker (raised from low). The related case was verified: it lost the keystroke.
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

## Resolution (2026-11-21)

Reproduced first in `e2e/load-window-keystroke.spec.ts`, guest and cloud. All
six tests failed on the unfixed code:

- **(a) The keystroke was lost (verified).** One key typed 78–108 ms after the
  editor mounted was in neither IndexedDB nor the server 4 s later, and was gone
  after a reload.
- **(b)** A keystroke in the window, then back to the stored text: "Saving…"
  stayed up.
- **(c)** The same "back to the stored text" edit made outside the window,
  before the 2 s autosave fired: "Saving…" also stayed up. The IndexedDB
  write-ahead still held the undone text, marked as a local edit.

Fix:

1. **One baseline.** `useAutoSave` takes the editor's `lastSavedContentRef` as
   `lastSavedRef`, so both read and write the same "last saved content".
   `flushSave` no longer marks a failed save as saved.
2. **The load window ends at the first real input.** `MilkdownEditor` gets an
   `onUserInput` prop. It fires in the capture phase, before ProseMirror
   handles the event, for beforeinput, paste, drop, cut, composition and
   editing keydowns (`isEditingInputEvent`). `decideEditorChange` adopts an
   emission as the load baseline only if no input has been seen yet. The 1 s
   timer stays as an outer bound only, for changes that come without an input
   event (a portaled toolbar button). The shared-note views had the same rule
   with an 8 s window, and now use the same input flag.
3. **Back to the saved text.** `decideEditorChange` returns `backToBaseline`.
   While the editor is dirty with no save in flight, it cancels the pending
   autosave and the pending write-ahead, rewrites the cached copy as clean, and
   sets the status to clean.
