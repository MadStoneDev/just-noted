# Possible keystroke loss: editor view recreated while typing starts

- **Status:** **closed 2026-11-27 — not reproduced; the premise was a
  misreading** (see "Findings"). The CSS follow-up was tried and not shipped (see "Resolution").
- **Was:** open, unconfirmed. Found 2026-11-26 while diagnosing
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

## Findings (2026-11-26)

Diagnostic: `e2e/diag-editor-remount.spec.ts` (skipped unless `E2E_DIAG=1`).
An init script records every `.ProseMirror` element created/removed (with its
text on removal), every keydown and the view it went to, focus/visibility and
cross-tab messages; the test records server actions, then checks the typed text
in the editor, the IDB cache and the server once things settle. Scenarios: the
pagehide replica's order (second tab loads, `bringToFront`, type), single tab,
type at once after creating, cloud single tab.

**1. The warning is not a view being created.** `prosemirror-view` calls
`checkCSS` from its DOM observer the first time a *typed* DOM change is
flushed (`node_modules/prosemirror-view/dist/index.js`, `checkCSS` ←
`DOMObserver.flush` when `from > -1`), and warns once per page. In all 60
guest runs it fired 3–21ms after the first keystroke, with the same view
receiving every key. "Recreated ~25ms into typing" was this warning.

**2. No view recreated while typing, no keystrokes lost.** Same load as the
pagehide work (14 busy loops / 16 cores, 4 workers), 20 repeats each:

| Scenario | Views created while typing | Text intact: editor / cache / server |
| --- | --- | --- |
| guest, replica order | 0/20 | 20/20 / 20/20 / 20/20 |
| guest, single tab | 0/20 | 20/20 / 20/20 / 20/20 |
| guest, type at once after create | 0/20 | 20/20 / 20/20 / 20/20 |
| cloud, single tab | 0/20 | 20/20 / 20/20 / 20/20 |

(2 cloud runs had a second view — the test's own Ctrl+J from the account's
existing note to the new one, before typing.)

**3. The two "nothing written" runs are explained by the pre-fix close path.**
On the build they came from, every close-time write sat behind an async step:
`saveNoteToLocal` put the record from a `get` callback, `enqueueContentNow`
from a `getAll` callback, and the save was an ordinary fetch. The probe logged
a put only when `put()` was called — so "no put, no fetch" means the page died
before any callback ran, the extreme case of the bug fixed in `9e086e0`. After
that fix, under the same load: 0 such losses in 100 close runs (original test
20, replica 40, guest close 40).

## Proposed (2026-11-26; approved 2026-11-27)

- Close this ticket: no remount-while-typing and no keystroke loss found.
- Optional, separate: give `.ProseMirror` `white-space: pre-wrap` (or load
  `prosemirror-view/style/prosemirror.css`). Without it ProseMirror falls back
  to workarounds for collapsed whitespace, and the warning that misled this
  ticket goes away. App CSS change — not made.

## Resolution (2026-11-27)

- Closed as not reproduced.
- The CSS follow-up was tried and **not shipped**: it changes what gets saved. Shelved as `docs/tickets/editor-white-space-pre-wrap.md`.

### The `white-space: pre-wrap` attempt

Tried: `white-space: pre-wrap` on the live editor (`.milkdown .ProseMirror`),
the one rule from `prosemirror-view/style/prosemirror.css` it needs. The rest
of that file (ligatures off, a blue node-selection outline) would change the
look and was never considered.

**Look: unchanged except runs of spaces.** `e2e/diag-editor-css.spec.ts`
(diagnostic, `E2E_DIAG=1`) renders a note with `&nbsp;` empty lines (top level,
after a list, inside a quote), bullet / nested / ordered / task lists, a code
block with blank lines and indentation, a quote, a hard break and a long
unbreakable word, in light and dark, and records every block's box. Before vs
after: all 34 block boxes and the editor height (1160px) identical; the only
pixel change in either theme is one line, where runs of spaces ("two  spaces",
"three   spaces") show as stored instead of collapsing to one.

**Saved content: changed.** `e2e/typing-sync-race.spec.ts` failed 5/5 with
the rule on (guest and cloud): typing `start ` saved `start&#x20;` instead of
`start`. Why: with `white-space: normal` Chrome writes a space typed at the end
of a line into the contenteditable as U+00A0, which the markdown writer keeps as
a raw character (and the app/tests treat as whitespace). With `pre-wrap` Chrome
keeps it a plain space, and `mdast-util-to-markdown` encodes a leading/trailing
space of a paragraph as the character reference `&#x20;` (so it survives a
markdown round trip). Any autosave while the user pauses after a space would
then store `&#x20;` — visible in "View markdown source", exports and anywhere
the raw markdown is shown.

**If revisited:** pair the CSS rule with a serializer change (e.g. trim or
NBSP-encode trailing spaces in paragraphs before stringify, matching what
Chrome does today), and run `typing-sync-race`, `markdown-roundtrip` and the
diag spec above. The ProseMirror warning is harmless; there is no user-facing
bug to fix here.
