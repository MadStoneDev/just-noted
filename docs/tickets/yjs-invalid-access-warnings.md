# Yjs "Invalid access" warnings during tests

- **Status:** open. Logged 2026-11-26 from the quick-fixes batch; deliberately not fixed there.
- **Severity:** low. A warning, not an error: no test fails on it and no data is known to be affected. But it's noise that can hide a real collab problem, and it may point to a read of a detached type.
- **Area:** collaborative editing. `src/components/editor/milkdown-editor.tsx` (the `bind()` collab setup: `new Y.Doc()`, `service.bindDoc`, `applyTemplate`), `src/utils/collab-doc.ts` (`collabDocIsBlank`), and the libraries under them: `yjs` 13.6.32, `y-prosemirror` 1.3.7, `@milkdown/plugin-collab` 7.21.1.

## Problem

Test runs log:

```
Invalid access: Add Yjs type to a document before reading data.
```

It comes from yjs's `warnPrematureAccess()` (`node_modules/yjs/dist/yjs.cjs`).
It fires when a shared type with no `doc` yet is read (`length`, `toJSON`,
`toArray`, `get`, `getAttributes`, iteration, …). In other words, a "prelim"
type (created with `new Y.XmlElement()` / `new Y.XmlText()` and not yet
inserted) is read, or a type is read after its doc was destroyed. Yjs added
the warning in recent 13.6.x releases. Before that the same reads were silent.

Where it shows up: not in `npm test` (vitest, 679 passing, no occurrences on
2026-11-26) and not in Playwright's list reporter output. It's in the browser
console during the collab E2E specs (shared notes opened by two accounts:
`realtime-sync.spec.ts`, `typing-sync-race.spec.ts`, `shared-note-open.spec.ts`).
Confirm with a `page.on("console")` capture before starting.

## Likely causes (to confirm)

1. **y-prosemirror building prelim types.** `createTypeFromElementNode` /
   `createTypeFromTextNodes` (`y-prosemirror/src/plugins/sync-plugin.js`)
   create `Y.XmlElement` / `Y.XmlText`, set attributes and insert children
   before the type is in the fragment, and `updateYFragment` /
   `equalYTypePNode` read attributes/children while diffing. Most likely
   source; check whether a newer y-prosemirror avoids the reads.
2. **Reads after teardown.** The editor's cleanup destroys the doc while a
   debounced `persistNow` / the seed timer, or `collabDocIsBlank(doc)`, can
   still run and read `doc.getXmlFragment("prosemirror")`.
3. **`applyTemplate` on a doc still being bound** (seed path in `bind()`).

## Done when

- The collab E2E specs run with no "Invalid access" in the browser console
  (add a console check to those specs, failing on this message).
- If the source is the library (cause 1), either a version bump that fixes it
  or a documented decision to filter just this message in the test console
  check, with the upstream issue linked.
