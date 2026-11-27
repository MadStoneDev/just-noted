# Editor: `white-space: pre-wrap` on .ProseMirror (shelved)

- **Status:** shelved 2026-11-27. Not scheduled; this ticket keeps it from being lost.
- **Severity:** low. Nothing is broken today. Without the rule, ProseMirror logs a
  harmless console warning on the first edit, and runs of spaces typed in a
  paragraph show as one space (they are stored as typed).
- **Area:** `src/app/globals.css` (`.milkdown .ProseMirror`), the markdown
  serializer options (`markdownStringifyOptions`, used in
  `src/components/editor/milkdown-editor.tsx`, tested in
  `src/components/editor/markdown-io.test.ts`).
- **Background:** `docs/tickets/editor-recreated-while-typing.md`, "Resolution".

## Why it can't be a CSS-only change

The rule was tried on 2026-11-27. The look was unchanged, apart from runs of
spaces now showing: block boxes were identical in light and dark per
`e2e/diag-editor-css.spec.ts`. But it **changes what gets saved**:

- With `white-space: normal` (today), Chrome writes a space typed at the end of
  a line as U+00A0. The markdown writer keeps that as a raw character, and the
  app and tests treat it as whitespace.
- With `pre-wrap`, the space stays a plain space. `mdast-util-to-markdown` then
  encodes a paragraph's leading or trailing space as `&#x20;`. So any autosave
  while the user pauses after a space stores `start&#x20;`. That shows in "View
  markdown source", exports and anywhere raw markdown is shown.
  `e2e/typing-sync-race.spec.ts` failed 5/5 on this.

## What it needs

1. **The trailing-space save change.** Before or while stringifying, handle
   leading and trailing spaces in paragraph text so they are never written as
   `&#x20;`. Either trim them (what a reload effectively does today) or write
   them as U+00A0 (matching what Chrome produces now). Decide which. Keep the
   `&nbsp;` empty-line marker (`src/utils/empty-line-marker.ts`) and code blocks
   untouched: spaces in code must stay exactly as typed.
2. **Then the CSS rule:** `white-space: pre-wrap` on `.milkdown .ProseMirror`
   only. Not the rest of `prosemirror-view/style/prosemirror.css`, which turns
   ligatures off and adds a blue node-selection outline.
3. **Round-trip tests:**
   - Unit (`markdown-io.test.ts`): trailing space, leading space, several
     spaces inside a line, a line that is only spaces, and spaces next to marks
     (`**bold** `, `` `code` ``). Also spaces inside code blocks and inline code
     (unchanged), `&nbsp;` empty lines, and hard breaks. No output may contain
     `&#x20;`, and parse → stringify → parse must be stable.
   - E2E: extend `e2e/markdown-roundtrip.spec.ts` with typed trailing and double
     spaces through reload + resave. Run it, `e2e/typing-sync-race.spec.ts`
     (which caught this) and the `e2e/diag-editor-css.spec.ts` before/after
     screenshots.

## Done when

- `&#x20;` never appears in stored markdown from typing.
- The console warning is gone, and runs of spaces display as stored.
- Empty lines, lists, code blocks and the `&nbsp;` marker look the same as
  before, per the diag-editor-css screenshots.
- Unit tests, typecheck and full E2E pass with the no-conflicts guard.
