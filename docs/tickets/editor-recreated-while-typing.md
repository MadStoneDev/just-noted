# Possible keystroke loss: editor view recreated while typing starts

- **Status:** open, unconfirmed. Found 2026-11-26 while diagnosing
  `flaky-pagehide-second-tab-e2e.md`; deliberately not fixed in that change.
- **Severity:** potentially high (typed text silently never stored) if it
  reproduces; unknown frequency outside heavy CPU load.
- **Area:** the note editor's mount/remount path
  (`src/components/active-note-editor.tsx` — `editorRemountKey`, the hydration
  reconcile that "remounts the editor so Milkdown shows it", ownership
  takeover; `src/components/editor/milkdown-editor.tsx`). Related:
  `e2e/load-window-keystroke.spec.ts` (keystrokes right after a note opens).

## What was seen

Under heavy CPU load (14 busy loops on 16 cores, 4 Playwright workers), in
`e2e/diag-pagehide.spec.ts`, 2 runs out of ~80 typed into a freshly created
guest note, closed the tab ~0.25s later, and **nothing was written anywhere**:
the probe in the closing page saw `pagehide` but no IDB cache put, no queue put
and no save fetch; the server, the cache and the queue never held the text, so
a reload, a browser restart, a new tab and another device all showed the note
empty.

In both runs a `ProseMirror expects the CSS white-space property…` warning was
logged ~20ms after typing began (`6115ms tab1 typing` → `6134ms console.warning`).
ProseMirror logs that when an `EditorView` is created, so a view was (re)made
while the keystrokes were arriving. If the keystrokes went into a view that was
then replaced (or into one not yet connected to the app's change listener), the
app's state never saw them, and the close path had nothing to save.

## Why it's unconfirmed

- Those two specs didn't assert the editor contained the text before closing.
  With that assertion added (`real-world: guest note, close within 0.5s`),
  0/20 runs lost text.
- The warning is logged on every view creation, including in passing runs, and
  often near typing; its timing is a hint, not proof.

## To diagnose

1. Count `EditorView` creations per note open (init-script patch, or a dev-only
   counter), and log the time of each relative to the first keydown.
2. Type immediately after `createFirstNote` (no settle wait) under CPU
   throttling, 50+ repeats; after typing, compare the DOM text, the app's
   `latestValueRef` (via the editor handle / store) and the IDB cache.
3. If confirmed: find what remounts the editor in the first second
   (hydration reconcile `didReconcileRef`, `editorRemountKey` changes, the
   ownership effect) and either avoid the remount once input has been seen, or
   carry the live view's doc into the new mount.

## Done when

- Known whether a remount can drop typed text, and under which trigger.
- If so, a regression test that types during the first-second remount window
  under throttling and asserts the text is stored.
