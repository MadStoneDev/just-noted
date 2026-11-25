# Notebook export treats stored markdown as HTML

- **Status:** open. Found while fixing intentional empty lines (2026-11-25); deliberately left out of that fix.
- **Severity:** medium. No stored data changes, but every exported notebook file (TXT, Markdown, HTML) is wrong for notes stored as markdown, which is every note the current editor has saved.
- **Area:** `src/components/notebook-export-button.tsx` (the notebook breadcrumb's Export menu, rendered from `src/components/notebook-breadcrumb.tsx` inside `note-wrapper.tsx`).

## Problem

The component predates markdown storage. It assumes `note.content` is HTML
and never looks at `note.contentFormat`:

- **TXT** (`htmlToPlainText`): sets the markdown as a `div`'s `innerHTML` and
  reads `textContent`. Markdown syntax comes through as raw text (`# `, `- [ ]`,
  `**`), anything that looks like a tag is dropped, and entities are decoded,
  so an empty-line marker (`&nbsp;` line) becomes a stray non-breaking space
  instead of an empty line.
- **Markdown** (its own local `htmlToMarkdown`, not `@/utils/html-to-markdown`):
  the same `innerHTML` round trip, so the "markdown" export is the note's
  markdown with entities decoded and tag-like text removed. `&nbsp;` lines lose
  the marker, escaped characters are kept but inline HTML like `<u>` is lost.
- **HTML**: inserts `note.content` straight into `<article>` without rendering
  it, so the file shows raw markdown as a single run of text (newlines collapse
  in HTML).

Not affected: the single-note export (`src/utils/export-note.ts`), which
checks `contentFormat` and renders markdown with `marked`. That is the
behaviour this export should match, including the empty-line rule (Markdown
keeps `&nbsp;` lines, TXT writes them truly empty, HTML renders `<p>&nbsp;</p>`).

## Fix

Build each note's body with the single-note export's helpers instead of the
component's local converters:

1. Export `toMarkdown` / `toHtml` / `toPlainText` from `export-note.ts`
   (already exported for its tests) and use them per note in
   `formatNote` and the HTML case.
2. Delete the local `htmlToPlainText` / `htmlToMarkdown`.
3. Escape the note and notebook titles in the HTML output (they are
   interpolated unescaped today).
4. Tests: a markdown note with a heading, a task list, an empty-line marker and
   a code block exports correctly in all three formats; a legacy HTML note still
   exports.
