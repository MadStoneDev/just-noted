# JustNoted sidebar + modals redesign: implementation plan

Status: plan written 2026-11-27 against `prelaunch/playwright-and-b7` @ `6873877`. **Decisions on every conflict (C1–C24) and on fonts were made on 2026-11-27.** They are recorded under each C-number in section 3 and in section 4, and the stage text below reflects them. Stage 1 is being implemented next; the other stages are not started.

Inputs: `docs/redesign/project/README-for-code.md` (the brief) and the five mockups beside it (`Main`, `Search`, `Share`, `History`, `Notifications` `.dc.html`). The mockups reference a `support.js` that isn't in the folder, so they may not render as intended in a browser. Read them as markup: the layout is all inline styles.

## Ground rules (apply to every stage)

- **Out of scope:** the formatting toolbar, editor body styles and sync/save logic. No stage touches `src/components/editor/docked-toolbar.tsx`, `editor/split-toolbar.tsx`, the toolbar slot at `active-note-editor.tsx:2223`, `milkdown-editor.tsx`, the editor CSS in `globals.css`, `use-auto-save`, `use-notes-sync` or `stores/notes-store.ts` (beyond reading from it).
- **Colours:** keep the app's tokens. The mockups are dark-only and use their own hexes; translate each one to the nearest existing token (table below). There is no light mockup, so light mode comes from the same tokens' light values.
- **Type floor:** `text-label` (12px) / `text-meta` (13px) remain the only sizes under 13px in chrome. `src/typography-floor.test.ts` must stay green after every stage. New muted text uses `ink-4`/`ink-5` (already AA-checked). Any new surface token that small text sits on gets added to that test's surface list in the same stage.
- **Escape:** reuse `src/utils/escape-stack.ts` (`useEscapeLayer`). Don't write a second key handler.
- **Breakpoints:** keep the current `lg` (1024) for the rail and the sidebar-as-drawer split, and `md` (768) for the editor bar and sheet-vs-modal choices.
- **Every stage** ships on its own, keeps `npm test` and the Playwright suite green, and adds before/after screenshots to `docs/screenshots/` with the existing `SHOTS_TAG` harness pattern (`e2e/typography-screens.spec.ts`).

### Mockup colour → existing token

| Mockup (dark) | Use | Note |
|---|---|---|
| `#0B0D0D` rail, `#0E1111` main | `--color-canvas` | app dark canvas is `#050606`; keep the app's |
| `#121616` sidebar | `--color-panel` | |
| `#171D1D` / `#151B1B` popover, dialog, drawer | `--color-raised` | solid, as the brief asks |
| `#1E2525` / `#263030` / `#2A3434` lines | `--color-hairline` / `--color-border-control` / `--color-border-control-strong` | |
| `#E6ECEB` / `#C9D3D1` / `#A9B4B2` / `#9AA6A4` text | `ink` / `ink-2` / `ink-3` / `ink-4` | `ink-4` is AA-tested; `#56615F` (breadcrumb slash) → `ink-6`, decorative only |
| `#2CC4B5` accent fill, `#06201E` on accent | `--color-accent-fill` / `--color-accent-on-fill` | |
| `#173230` active bg, `#5FD8CC` active text | `--color-accent-tint` / `--color-accent-text` (`accent-text-soft` in dark) | |
| `#1A2726` selected row | `--color-accent-tint` | |
| `#24504C` search-hit `<mark>` | **new** `--color-mark` (+ `--color-mark-strong` for the title hit) | see Stage 3 |
| `rgba(4,6,6,.62)` scrim | `--color-bg-overlay` (existing) | |
| `0 16px 40px rgba(0,0,0,.5)` | **new** `--shadow-popover` | `--shadow-modal` already exists for dialogs |

**New tokens, in total:** `--color-mark`, `--color-mark-strong`, `--shadow-popover`, plus a z-index scale (`--z-popover`, `--z-drawer`, `--z-dialog`, `--z-toast`). Today's z-values run from 50 to 10010 (see Stage 1). All of them get light, dark-media and `.dark` values, matching the existing pattern.

---

## 1. Stages

| # | Stage | Size | Depends on |
|---|---|---|---|
| 1 | Tokens + dismiss contract (Esc / click-outside / X everywhere) | S | – |
| 2 | Rail rule (2a items + highlight + Help/Settings pages, 2b Notebooks swaps the sidebar only) | M | 1 |
| 3 | Sidebar (header count, "…" menu, footer gone, one sort + one Filter, previews) | M | 1 |
| 4 | Filter popover | S–M | 1, 3 |
| 5 | Editor header | M | 1 |
| 6 | Notifications popover | S–M | 1, 2 |
| 7 | Share dialog | M | 1 |
| 8 | Version history drawer (8a layout, 8b changes view) | M–L | 1 |

Stages 5, 7 and 8 are independent of 2–4 and of each other, so they can go in any order after 1.

---

### Stage 1: Tokens and the dismiss contract (no visible change except Esc/click-outside now works everywhere)

Smallest safe first: purely additive tokens, plus a behaviour fix the brief asks for (rule 8) that later stages build on.

**Files**
- `src/app/globals.css`: add the new tokens above, light + dark (both the media query and `.dark`).
- `src/utils/escape-stack.ts`: add `useDismissableLayer({ open, onClose, ref, outside: true, restoreFocus: true })`. It wraps `useEscapeLayer` and adds pointer-down-outside (ignoring clicks inside any *higher* layer, so a dropdown inside a dialog doesn't close the dialog), plus returning focus to the trigger. Escape logic stays in `escape-stack.ts`.
- Stragglers that miss part of rule 8 today:
  - `sidebar/index.tsx:1525-1560`: the move-to-notebook sheet has no Escape handling.
  - `notebook-export-button.tsx:44-53,302` and `bulk-action-bar.tsx:41-45,126`: click-outside only, no Esc.
  - `manage-shared-notes.tsx:141,634`: Esc but no click-outside.
  - `chat-drawer.tsx`: below lg it is an overlay with neither Esc nor a backdrop.

  Not changed: `account-deletion-gate` and `account-switch-modal` are deliberately not dismissable.

**Visual:** none.
**Behaviour:** those five overlays now close on Esc and on a click outside.
**Risks**
- Outside-click must ignore portalled children (floating-ui dropdowns render in `FloatingPortal`). Use the layer stack, not DOM containment, to decide whether a click is "inside".
- Chat overlay: closing on outside-tap below lg could lose an in-progress message. It only closes the panel, and the draft state lives in `use-note-chat`; verify that.

**Tests**
- Extend `src/utils/escape-stack.test.tsx`: outside-click closes only the topmost layer; a click in a child layer doesn't close the parent.
- Extend `e2e/escape-layers.spec.ts`: open the move sheet, press Esc, it closes; open an export menu, press Esc.
- Screenshots: none needed.

---

### Stage 2: Rail rule

**2a: items, order, highlight, Help and Settings as pages**

Target order (mockup): logo · Notes · Notebooks · Shared · ─ · Search (Ctrl+K) · spacer · Bell · Help · Settings · Account.

**Files**
- `src/components/sidebar/index.tsx:712-831` (rail + `RailButton`). Rail width goes from `w-14` (56) to 64 per the mockup; check `--sidebar-width` / the 340px aside.
- `src/components/note-wrapper.tsx`: the event handlers `:271-356` and the derived "active view".
- `src/components/help-modal.tsx`: becomes a routed page, `/help`. Its menu gains Tools and Roadmap entries.
- New `src/app/(app)/help/page.tsx` (null page, drawn by NoteWrapper like `/settings`). Settings and Help get a Back arrow at the top of the main area that returns to the last note.
- `src/utils/account-place.ts:12`: drop `"notebooks"` and `"tags"` from `RAIL_VIEWS`, and map stored values to `"notes"` on restore.

**Visual**
- Rail reordered. Tools, Roadmap and New note leave the rail; Admin's fate is in the conflicts list.
- The active item uses the existing `accent-tint` / `accent-text` pair (the mockup's `#173230` / `#2CC4B5`).

**Behaviour**
- **One source of truth for the highlight:** a single `currentSurface` derived in NoteWrapper (`notes | notebooks | shared | notifications | help | settings | trash | tools | roadmap | admin | public`). The rail reads it instead of path checks.
- This fixes these mismatches:
  - Notes stays lit while Trash, Notifications or a shared note fills main (`onNotesApp` is path-only, `sidebar/index.tsx:212-224`).
  - A legacy `railView` restored from localStorage lights nothing (`:249-256`).
  - Clicking Notes leaves a shared note open in main (`note-wrapper.tsx:350-353`).
- Help opens a page, not a modal.
- The Ctrl+K and Help shortcuts keep working. `e2e/escape-layers.spec.ts` currently opens Help as a dialog, so update it.

**2b: Notes / Notebooks / Shared swap the sidebar only, and the editor stays put**

- **Today:** Notebooks pushes `/notebooks`, the main area becomes `NotebooksGrid` and the sidebar shows `NotebookTree`. Notes and Shared also clear Trash and Notifications and push `/`.
- **Change:** Notebooks shows `NotebookTree` in the sidebar and leaves the editor alone. Notes and Shared stop touching main.
- **Files:** `note-wrapper.tsx` (`:271`, `:344-356`, `:633-762` main-area priority), `sidebar/index.tsx:835-839`, `notebook-tree.tsx:127-135`.
- **Per C1:**
  - Clicking a notebook in the tree sets the list's notebook filter instead of pushing `/notebooks/:id`.
  - An "All notebooks" link at the top of the tree opens the existing `NotebooksGrid` in main.
  - `/notebooks` and `/notebooks/[id]` URLs keep working: a direct load still renders the grid / NotebookView.
- **Per C3 and C3b:** Admin stays on the rail as an extra item, admins only. The rail "+" stays until Stage 3 lands, then Stage 3 removes it.
- **Mobile:** `mobile-chrome.tsx` `MobileTabBar` (Notes, Notebooks, Shared, Settings, You) already has the right first three items. Align its handlers (`note-wrapper.tsx:364-460`) with the same rule. The mobile list is a full-screen drawer, so "editor stays put" means "the editor is still there when you close the list".

**Risks**
- 2b changes navigation people already use (grid, covers, NotebookView).
- `/notebooks` and `/notebooks/[id]` URLs and their back-button history.
- Removing the rail New note button: Ctrl+J and the mobile FAB remain, and the sidebar "+" arrives in Stage 3. Ship 2a and 3 together, or keep the rail "+" until 3 lands.
- **Selectors that break:**
  - `core-flows.spec.ts`: "New note" button.
  - `shared-note-open.spec.ts`: `/notifications/i`.
  - `escape-layers.spec.ts`: Help dialog.

**Tests**
- Unit-test the `currentSurface` derivation: a table of (path, flags) → surface.
- New e2e `rail-highlight.spec.ts`: for each rail item plus Trash, Search and a shared-note deep link, exactly one `aria-current="page"` and it matches main.
- 2b: switching Notes → Notebooks → Shared keeps `main[aria-label="Note editor"]` showing the same note.
- Screenshots: rail desktop dark and light, before and after; Help page; Settings with Back.

---

### Stage 3: Sidebar

**Files**
- `src/components/sidebar/index.tsx`: header `:853-927`, search `:933-955`, controls row `:958-1023`, footer `:1229-1257`, rows `:1121-1203`.
- `src/components/notes/note-card.tsx`
- `src/utils/html-utils.ts` (preview)
- `src/lib/filter-notes.ts` (labels)
- `src/components/search-modal.tsx` (selection sync only)

**Visual**
- **Header:** title, count (mono `text-label`, `ink-4`) reading "20", or "3 of 20" while searching or filtering, then "+" New note (accent) and a "…" menu. The count moves from the footer (`N notes · M shown`) to the header and must exclude tombstones (the footer uses `notes.length` today).
- **"…" menu** (ds `Dropdown`): Select, Trash, Export all. The footer goes.
- **Under the search box:** one sort dropdown and one Filter button. The inline Source dropdown and the inline Select button go; Source moves into the Filter popover (Stage 4).
- **Rows:**
  - Title 14/600.
  - Preview 13px (`text-meta`) at `ink-4`. Today it is `ink-5` at `md:text-meta`; both pass AA, but `ink-4` is the closer match.
  - Meta 12px (`text-label`): notebook · Cloud/Local · date.
  - Selected row = `accent-tint` bg + `accent-text` title.
  - Mobile sizes today are 16 / 13.5px. Keep them ≥ 13; the floor test catches anything under 12.
- **Search hits:** wrap matches in `<mark>` using the new `--color-mark` tokens (title hit stronger). Both mark colours need AA against `ink`; add them to the contrast test.

**Behaviour**
- **Previews strip markdown and entities fully.** Fix `getNotePreview` format detection (`note-card.tsx:30`: any `<tag>` flips a markdown note to the HTML stripper). Add `_x_`, `__x__`, table pipes and backslash escapes to `stripMarkdownToText`.
- **The selected note always matches the editor:**
  - `search-modal.tsx:46-52` `handleSelect` must go through the same "open note" path as a row click: close the shared note, trash and notifications, leave a routed view, close the mobile drawer.
  - When the active note is filtered out of the list, pin it at the top with a "Not in this filter" hint (decided, C9).
- Remove the rail "+" in this stage, now that the sidebar header has one (C3b).
- Row extras all stay (tags, hover TagPicker, hover delete, drag handle, storage dot, swipe), except the Ctrl+Alt+digit hover hint, which goes (C7). The Ctrl+Alt+digit shortcut itself still works.
- Both searches stay (C8): the sidebar box filters the list, Ctrl+K jumps to a note.
  - Delete the dead `window.scrollTo` + ring code (`sidebar/index.tsx:438-457`); use `scrollIntoView({block:"nearest"})` on the active row.

**Risks**
- **Long-press select** on mobile (`mobile-chrome.tsx` `SwipeableRow`) stays. Only the inline button moves.
- **Row extras:** hover TagPicker, hover delete, shortcut digit and drag handle aren't in the mockup (C7). Keep them unless told otherwise.
- **Selectors:**
  - Heading text "All Notes" (`smoke`, `escape-layers`, `typing-sync-race`, `sign-out-offline-multi-account`): the mockup writes "All notes". Use a case-insensitive name, or keep the casing.
  - `core-flows.spec.ts` footer count regex `/^\d+ notes?$/` and `title="Trash"` need updating.

**Tests**
- Unit:
  - `html-utils.test.ts` cases for each new strip rule and for a markdown note containing `<br>`.
  - Count excludes tombstones.
- e2e:
  - Header count reads "N", then "k of N" after typing in search.
  - The "…" menu has Select, Trash and Export all.
  - Ctrl+K selection while Trash is open shows the note in main and highlights its row.
- Screenshots: sidebar desktop and phone × dark and light, plus a searching state (matches `Search.dc.html`).

---

### Stage 4: Filter popover

**Files**
- `src/components/sidebar/index.tsx:1284-1389` (the current "Filter & sort" sheet).
- New `src/components/ds/popover.tsx`: floating-ui anchored, built on `useDismissableLayer`. `ds/dropdown.tsx` already wires `useFloating`/`flip`/`shift`; share that setup.
- `src/components/tag-filter.tsx` (reused inside).

**Visual**
- A 300px popover on solid `--color-raised` with `--shadow-popover`, anchored under the Filter button.
- Header "Filter" + X. Sections: **Stored** (All / Cloud / Local), **Notebook** (checkboxes), **Show** (Pinned only), Tags (see C5). Footer: Clear · Done.
- Filter button label "Filter · N" with an accent state when N > 0. N counts every active filter including the notebook, which today's count leaves out (`:996` vs `:1003`).
- **Phones (< md):** keep the existing bottom-sheet presentation with the same contents. The brief only specifies the anchored popover on desktop.

**Behaviour**
- **Sorting leaves the sheet.** It lives only in the sidebar dropdown (the sheet's hard-coded sort labels `:1323-1329` go away).
- The "Bulk actions" toggle leaves the sheet (Select is in the "…" menu now).
- Guest Source options become consistent: no Cloud for guests, matching the sheet rather than the inline dropdown.

**Risks**
- **Notebook filter** (decided, C4): a single-select radio list (All / each notebook / Loose notes) mapping onto `activeNotebookId`. Multi-select is a possible follow-up.
- **Pinned** keeps All / Pinned / Unpinned (C6).
- **Tags section** stays in the popover, signed-in only (C5).

**Tests**
- e2e: open the popover, Esc closes it, click outside closes it, the X closes it. Focus returns to the Filter button. Choosing Cloud updates the count and "k of N".
- Unit: filter count includes the notebook.
- Screenshots: popover desktop dark and light; sheet on phone.

---

### Stage 5: Editor header

**Files**
- `src/components/note-view/note-action-bar.tsx`
- `src/components/active-note-editor.tsx:1870-1951` (the bar's contents only; not the toolbar slot `:2223`, not the body)
- `src/components/notebook-breadcrumb.tsx`: exists, imported, never rendered.
- `src/components/share-note-button.tsx` (trigger only)

**Visual** (left → right)
1. Breadcrumb "Notebook / Title" (13px, `ink-4` / `ink-2`).
2. Save status: dot + "Saved to cloud" (12px).
3. Spacer.
4. Wide, History, Tags and the "…" menu as 36px icon buttons.
5. A filled "Share" button.

Wide "on" uses `accent-tint` / `accent-text` in **both** themes. Today it uses `--color-accent` / `--color-accent-subtle`, which have no dark override, and `#03BFB5` text on a light canvas is likely under AA. That is the brief's "aqua when on, in both states" fix.

**Behaviour**
- **Save status in the header** reads the same source as the existing `data-testid="save-status"` line under the title (`active-note-editor.tsx:2021-2059`). It is read-only; no sync logic changes.
- **Save status lives in the header only** (C11). Remove it from the stats line under the title; word count, goal and tags stay there. Keep `data-testid="save-status"` on the header copy.
- **Controls not in the mockup move into the "…" menu** (`ds/command-palette` Actions): Formatting help "?", Markdown source toggle, Import, Split view / Change note, the Cloud/Local pill (C10). Presence avatars stay visible in the header on shared notes. Ctrl+Shift+M is unchanged.
- **Wide keeps its 3-state cycle** (off → this note → all notes). Both on-states are aqua (`accent-tint` / `accent-text`) in both themes (C12).
- **The notebook pill under the title is removed** (C12b). The breadcrumb's notebook part is a button that filters the list to that notebook.
- **Phones:** the bar stays `hidden md:flex`. `MobileEditorNav` (‹ Notes · Share · …) already matches the mockup's intent.
- Fix the 768–1023 overlap where both the mobile nav and the desktop bar render.

**Risks**
- Two places now show save state; they must never disagree (single selector or hook).
- Wide is a 3-state cycle (off → this note → all notes); the mockup implies 2-state (C12).
- Breadcrumb truncation with long titles and nested notebooks: middle-truncate the notebook path, keep the title.
- **Selectors:** `title="Version history"`, `data-testid="wide-toggle"`, "Share note" button (`core-flows`). Keep the testids and aria-labels.

**Tests**
- Update `note-action-bar.test.tsx` (wide active classes → `accent-tint`/`accent-text`).
- Unit: save-status label mapping shared by both locations.
- e2e: type in the editor, header goes Saving… → Saved; the breadcrumb shows the notebook.
- Screenshots: header desktop dark and light, wide on and off, shared-note (teal) variant.

---

### Stage 6: Notifications popover

**Files**
- `src/components/notifications-view.tsx`: content reused inside a popover.
- `note-wrapper.tsx:320-331, 403-418, 653-662`
- Rail bell in `sidebar/index.tsx`
- `ds/popover.tsx` (from Stage 4)

**Visual**
- A 360px popover anchored to the bell (opens up and right from the bottom of the rail).
- Header "Notifications" · "Mark all read".
- Unread rows tinted with a dot: title 14/500, then "Can view · 24 minutes ago" at 13px `ink-4`.
- Today's sizes (13.5 / 12.5px) are replaced by 14 / 13 (both are allowed by the floor).

**Behaviour**
- **No longer a main-area view:** the editor stays, and `showNotifications` main state is removed.
- Opening a "shared with you" notification closes the popover and reuses `openSharedFromNotification` (rail → Shared, note selected). That path already does what the brief asks and is covered by `e2e/shared-note-open.spec.ts`.
- The bell is highlighted only while the popover is open.

**Risks**
- **Click targets by type** (C13): `edited_shared_note` opens the note; `chat_message` and `mention` open the note with the chat open.
- **"Clear all"** stays as a quiet secondary action next to "Mark all read" (C14).
- **Long lists:** cap the height (e.g. 60vh) and scroll.
- **Phones** (C15, revised): a bell with an unread badge sits in the top-right of the notes list header, next to "+" and "…" (`sidebar/index.tsx` header, below lg). It opens the same notifications content as a bottom sheet, reusing the `ds/drawer` sheet styles. The You drawer and the You tab are unchanged. Add a 390px e2e: tap the bell → sheet → tap a share notification → Shared list with the note selected.

**Tests**
- Update `e2e/shared-note-open.spec.ts`: click the bell (popover), click the notification, assert the URL, Shared rail current and the active row. Add Esc and click-outside.
- Unit: unread badge clears after Mark all read.
- Screenshots: popover desktop dark and light; empty state.

---

### Stage 7: Share dialog

**Files**
- `src/components/share-note-button.tsx`: presentation `:255-444`; no server-action changes.
- `ds/modal.tsx`: add a `sheetBelow="md"` option so the same component is a centred dialog on desktop and a bottom sheet on phones. Reuse the `ds/drawer` sheet styles.

**Visual** (`Share.dc.html`)
- 520px centred dialog. Title `Share “<title>”`. Subline "Only you can see this note right now." when nothing is shared, otherwise who has access.
- **Invite people** first: Username or email · role dropdown · Invite.
- **Link** second: an "Anyone with the link" row with an Off / Can view / Can edit dropdown, and the hint underneath.
- Scribe upsell as one quiet 12px line ("Want people to edit with you in real time? That's part of Scribe.").
- Footer: Copy link · Done.

**Behaviour**
- **Order flips:** invite first, then link. Today it is link first, then the upsell, then People.
- **View count** is hidden until a link exists (today it shows "0 views" in the drawer description).
- The upsell keeps its current action (opens Settings › Plan & usage); only the copy and size change.
- Copy link gets error handling (a toast on clipboard failure).
- Phones: bottom sheet, as today.

**Risks**
- **Things the mockup doesn't show that exist today** (C16):
  - People-with-access list with per-person role and remove.
  - Stop sharing.
  - Link password, expiry and "Hide my name".
  - "Published — soon".
  - The Scribe gating on "Can edit" (both link and invite).

  Decided (C16): keep all of them in the same dialog, below the link row, shown only when relevant.
- **Copy link with the link Off** (C17): disabled, with the hint "Turn the link on first". Copying never turns the link on implicitly.
- The `justnoted:open-share` event from the mobile nav must still open it.
- Dead code nearby: `add-shared-drawer.tsx` is unused; delete it in this stage or leave it, but don't restyle it.

**Tests**
- e2e: Share → dialog (role `dialog`, `aria-modal`); Esc, outside-click and X each close it. Invite a user → they appear in the list. Turn the link on → Copy link copies it, and the view count appears.
- e2e at 390px: it renders as a sheet.
- Screenshots: unshared, link on, with people; desktop and phone × dark and light.

---

### Stage 8: Version history drawer

**8a: layout (no new data)**

**Files**
- `src/components/version-history-panel.tsx` (+ its test)
- `ds/drawer.tsx`: add `side="right"`; today it is bottom-only.
- `active-note-editor.tsx:2280-2290` (mount and restore; logic unchanged)

**Visual**
- A 720px right drawer over the scrim. Header: "Version history" · "N versions" · X.
- Left column (260px): From/To filter, then versions grouped by day ("Today", "3 October"). Each item shows the time at 14/500 and a 13px detail line.
- Right: preview with a Changes / Full text toggle (8a ships Full text only, with Changes disabled until 8b).
- Footer: Copy text · **Restore this version**.

**Behaviour**
- **List and preview side by side** instead of the preview replacing the list. Restore moves from the preview header to the footer; the existing `ConfirmModal` and the "edited in another tab" guard stay.
- **Copy text** is new: clipboard plus a toast.
- **Phones (< md):** full-width drawer with list → preview as two steps (Back), like today's in-place swap.
- The filter keeps its Scribe gating (`getVersions` `canFilter`) and `datetime-local` inputs (decided, C18).
- **Detail line is word deltas only** (decided, C19, no new column): "+38 words · 941 words", computed client-side from adjacent versions.

**8b: Changes (diff) view**
- New `src/utils/text-diff.ts`: word-level diff of the plain text from `stripContentToText`. No diff library is installed; either add `diff` (jsdiff, ~20 KB min, lazy-loaded with the drawer) or write a small LCS on words. Recommendation: `diff`, dynamically imported.
- Rendering: insertions underlined with `accent-tint` and `accent-text`; deletions struck through in `ink-4`. Colour is never the only cue, and a legend line sits under the diff, as in the mockup.
- **Risk:** big notes. Cap the diff at about 50k words and fall back to Full text with a notice.

**Left alone** (decided, C20): `shared-history-panel.tsx` (the recipient's view: per-version Copy, no restore).

**Tests**
- Update `version-history-panel.test.tsx`: Esc, backdrop and the X close it; Restore in the footer opens the confirm; Copy text calls the clipboard.
- Unit: `text-diff` (insert, delete, replace, empty, huge input fallback); word-delta labels.
- e2e: seed 3 versions, open the drawer, select the oldest, Changes shows a deletion, Restore → the editor content matches.
- Screenshots: extend the existing `version-history-*` set in `typography-screens.spec.ts`: desktop and phone × dark and light, Changes and Full text.

---

## 3. Conflicts with current features

Listed in the first draft without decisions. Each one now has a **Decision** line, made 2026-11-27.

**Navigation and rail**
- **C1. Notebooks no longer opens a main-area view.** Today Notebooks → `/notebooks` shows `NotebooksGrid` (covers), and a notebook → `NotebookView` in main. "Swap the sidebar only, the editor stays put" removes the rail path to both. Open questions:
  - Keep them reachable another way, e.g. a "View all notebooks" link in the tree?
  - Drop them?
  - What do `/notebooks` URLs do?
  - Drag-a-note-onto-a-grid-notebook only works on the grid.
  - **Decision:** Notebooks swaps the sidebar to the tree; clicking a notebook filters the list. An "All notebooks" link at the top of the tree opens the existing grid in main. `/notebooks` URLs keep working.
- **C2. Tools and Roadmap move into Help.** It's one more click, and Roadmap is linked publicly. Their routes (`/tools*`, `/roadmap`) stay. Do the rail-less public routes (`/pricing`, `/the-how`, `/the-what`) keep the rail at all?
  - **Decision:** Tools and Roadmap move into Help. Public routes unchanged.
- **C3. Admin rail item** (admins only) isn't in the mockup. Options: into Settings, into Help, or kept as an extra rail item for admins.
  - **Decision:** Admin stays as an extra rail item, admins only.
- **C3b. The rail "New note" button goes.** The mockup puts "+" in the sidebar header. Ctrl+J and the mobile FAB remain.
  - **Decision:** Keep the rail "+" until Stage 3 lands, then remove it.

**Sidebar and filter**
- **C4. Notebook filter becomes multi-select checkboxes** in the mockup. Today it's a single notebook (with a breadcrumb through nested notebooks) set from row chips, the tree and the editor pill. Nested notebooks aren't represented in the checkbox list.
  - **Decision:** Single-select notebook (radio list, including Loose notes). Multi-select maybe later.
- **C5. Tags filter is missing** from the mockup's Filter popover. Today it is in the sheet, signed-in only. Removing it removes tag filtering for owned notes entirely: the legacy Tags rail view is also going.
  - **Decision:** Keep a Tags section in the Filter popover (signed-in only).
- **C6. Pinned:** the mockup has "Pinned only". Today there are three options (All / Pinned / Unpinned); "Unpinned" would go.
  - **Decision:** Keep All / Pinned / Unpinned.
- **C7. Row extras not in the mockup:**
  - Tags on rows (up to 3)
  - Hover TagPicker
  - Hover delete
  - The Ctrl+Alt+digit hint
  - Drag handle (manual sort, drag into a notebook)
  - Storage status dot that opens the "Storage & status" modal
  - Swipe actions on mobile
  - **Decision:** Keep all row extras (tags, hover delete, drag, storage dot, swipe) except the Ctrl+Alt+digit hint.
- **C8. Two searches.** The brief says "Search is a floating box (Ctrl+K)". `Search.dc.html` shows the sidebar search input filtering the list ("3 of 20", highlights). Today both exist with different semantics: the sidebar box filters the list, Ctrl+K jumps to a note. Keep both, or fold one into the other?
  - **Decision:** Keep both searches: the sidebar box filters the list, Ctrl+K jumps to a note.
- **C9. Active note filtered out of the list.** "The selected note always matches the editor" needs a rule when the open note doesn't pass the current filter or search. Options: show it pinned at the top, clear the filter, or accept no highlight.
  - **Decision:** Pin the active note at the top with a "Not in this filter" hint.
- **C9b. Manual sort and drag-reorder** exist and aren't shown. The sort dropdown will keep "Manual".
  - **Decision:** Manual sort and drag-reorder stay (follows from C7).

**Editor header**
- **C10. Controls with no home in the mockup:** Formatting help "?", Markdown source toggle, Import .txt/.md, Split view / Change note, Cloud/Local pill, presence avatars (shared notes), the chat handle. The plan default is to move them into the "…" Actions menu, except presence, which stays visible on shared notes.
  - **Decision:** Move them into the "…" menu; presence avatars stay visible on shared notes.
- **C11. Save status in two places.** The mockup puts it in the header. Today it sits in the stats line under the title, together with word count, goal and tags. That line is arguably editor body. Remove it from under the title, or keep both?
  - **Decision:** Save status in the header only. Word count, goal and tags stay under the title.
- **C12. Wide view is 3-state today** (off / this note / all notes). The mockup shows a 2-state toggle "on for this note". Is "all notes" dropped, moved to Settings, or kept as the cycle?
  - **Decision:** Keep the 3-state wide cycle, aqua in both on-states.
- **C12b. Notebook pill under the title** (clickable to filter) duplicates the new breadcrumb.
  - **Decision:** Remove the notebook pill under the title; the breadcrumb's notebook part is clickable and filters the list.

**Notifications**
- **C13. Other notification types** (edited shared note, chat message, mention) exist; the mockup only shows a share. Each needs defined behaviour on click.
  - **Decision:** Edited shared note opens the note; chat message and mention open the note with the chat open.
- **C14. "Clear" (delete all notifications)** exists today; the mockup has only "Mark all read".
  - **Decision:** Keep "Clear all" as a quiet secondary action next to "Mark all read".
- **C15. Phones have no bell.** The tab bar is Notes, Notebooks, Shared, Settings, You. There are no mobile mockups. Options: add a bell to the tab bar or the You drawer, or leave phones without notifications as today.
  - **Decision (revised 2026-11-27):** Phones get a bell in the top-right of the notes list header (next to "+" and "…"), with an unread badge. It opens the notifications as a bottom sheet. (This replaces the earlier "You drawer + badge on the You tab" decision.)

**Share**
- **C16. Share features the mockup doesn't show:**
  - The people-with-access list (role change, remove)
  - Stop sharing
  - Link password, expiry and "Hide my name"
  - "Published — soon"
  - "Can edit" link level and its Scribe gate
  - The views count once shared
  - **Decision:** Keep everything, below the link row, shown only when relevant.
- **C17. "Copy link" with the link Off.** The mockup shows the footer button while the link is Off ("no link exists yet").
  - **Decision:** Copy link is disabled while the link is Off, with the hint "Turn the link on first". Never turn the link on implicitly.

**Version history**
- **C18. History filter:** the mockup uses plain `date` inputs and looks ungated; today it's `datetime-local` and Scribe-only, enforced server-side.
  - **Decision:** Keep `datetime-local` and the Scribe gate.
- **C19. Version labels** ("Autosave", "First synced to the cloud", "Created") need a `kind` column on `note_versions` (a migration plus writes in `saveVersion`). That touches save-adjacent code, which is out of scope. Without it, only word deltas are possible.
  - **Decision:** No new column. Word deltas only.
- **C20. Shared recipient history** (`shared-history-panel.tsx`) isn't in the mockups. Is it restyled to match, or left alone?
  - **Decision:** Leave `shared-history-panel.tsx` alone.

**Cross-cutting**
- **C21. No mobile mockups** except "Share is a bottom sheet on phones". Every other phone layout is inferred.
  - **Decision:** Infer phone layouts from the existing app patterns; screenshots for every stage.
- **C21b. No light-theme mockups.**
  - **Decision:** Infer light layouts from the existing tokens; screenshots for every stage.
- **C22. Mockup palette and sizes differ from the app:**
  - Dark canvas `#0E1111` vs `#050606`; accent `#2CC4B5` vs `#0FB8B0`.
  - Rail 64 vs 56px; sidebar 312 vs 284px of content.

  The brief says to keep existing colours. Sizes are left for the reviewer to choose.
  - **Decision:** Keep app colours. Keep current widths (56 rail, 284 sidebar) unless a stage's screenshots look cramped; flag it if so.
- **C23. Help and Settings become full pages with Back.** Help is a modal today, and its Keyboard shortcuts subview is reached via Esc / Back. Settings already is a page.
  - **Decision:** Approved.
- **C24. Dead code found:**
  - `add-shared-drawer.tsx`
  - `page-estimate-modal.tsx` and `word-count-goal-modal.tsx` (the only `ui/modal` callers besides `/backup-manager`)
  - `delete-button.tsx` / `ConfirmDrawer`
  - `writing-session-indicator.tsx`
  - `NotebookBreadcrumb` (imported, unrendered)
  - `notebook-nav-list.tsx` (only reachable through a stale `railView`)

  Not a conflict, but each stage should say whether it removes the dead code next to it.
  - **Decision:** Delete dead code in the stage that touches its area.

---

## 4. Fonts

### What the mockups use
- **IBM Plex Sans** 400/500/600: all UI chrome.
- **IBM Plex Mono** 400/500: counts and stats ("20", "3 of 20", "941 words · 5 min").
- **Newsreader** 400/600 (opsz 6–72): the editor title and body.

### What the app loads now
Loaded in `src/app/layout.tsx` via `next/font/google`. Sizes are measured from the current `.next` build, Latin subset, preloaded `woff2`; all four are variable files.

| Family | Var | Used for | Latin woff2 |
|---|---|---|---|
| Public Sans (400–700) | `--font-public-sans` → `--font-ui` | **all UI chrome** | 26.6 KB |
| Newsreader (400–600, normal + italic) | `--font-newsreader` → `--font-editor` | editor, view headings | 58.2 + 64.5 KB |
| Inter (400–700) | `--font-inter` → `--font-primary` | ~1 reference (legacy) | 48.4 KB |
| Playfair Display (400–900) | `--font-playfair` → `--font-brand`/`--font-secondary` | the "Noted" wordmark in `global-header.tsx`, `not-found.tsx`, editor fallback stack | 38.5 KB |
| **JetBrains Mono** | `--font-meta`, `--font-mono` | all `font-[family-name:var(--font-meta)]` meta text, kbd | **not loaded at all.** It is only named in CSS, so it falls back to `ui-monospace` (Consolas / Menlo / DejaVu Sans Mono depending on OS). Also offered as the editor "Mono" option in Settings. |

That is about **236 KB** of preloaded Latin fonts today. About 87 KB of it (Inter + Playfair) serves almost nothing.

### What switching would cost

The brief says to keep the existing fonts where they exist, so the default is **no switch**: Public Sans stays for UI and Newsreader is already the editor face. The table below is so a switch can be judged.

| Option | Network | Visual risk | Work |
|---|---|---|---|
| **A. Keep Public Sans; actually load a mono** (JetBrains Mono, or IBM Plex Mono 400/500) for `--font-meta` | +~20–30 KB if preloaded (Plex Mono static, 2 weights ≈ 2×13–16 KB; JetBrains Mono variable ≈ 30–40 KB). Can be `preload:false`, since meta text isn't LCP. | Low. Counts and stats stop varying by OS. | 1 `next/font` call, 2 var lines. The Settings editor "Mono" option starts showing a real JetBrains/Plex. |
| **B. Switch UI to IBM Plex Sans** (+ Plex Mono) | Plex Sans on Google Fonts is static per weight: 3 weights ≈ 3×20–25 KB ≈ 60–75 KB, vs Public Sans 26.6 KB (one variable file). Net ≈ +35–50 KB. | Medium. Plex is wider and taller than Public Sans at the same px, so every fixed-width chrome element shifts: the rail, the 284px sidebar column, 36px icon buttons with labels, truncation points, the roadmap columns. All screenshot sets would need redoing. | 1 `next/font` swap + `--font-ui`. Real cost is a visual QA pass over every screen, not just the redesign surfaces. |
| **C. Drop Inter and Playfair** (independent of A/B) | −~87 KB preloaded | Low. The wordmark in `global-header.tsx` / `not-found.tsx` would need another face (Newsreader 600 is closest), and the email templates name Playfair by string only (unaffected). | Remove 2 `next/font` calls; repoint `--font-primary`/`--font-brand`/`--font-secondary`. |

Newsreader: the mockup uses the optical-size axis (`opsz 6..72`). `next/font` loads it with `axes: ["opsz"]`. It isn't requested today, so a change would be editor body styles, which are out of scope. Note only.

**Recommendation for the reviewer:** A + C costs less in total than today (about −60 KB) and gives the mono the mockups rely on. B is a separate, whole-app decision, not part of this redesign.

**Decision (2026-11-27):** A + C, shipped as a separate commit within Stage 1.
- Load IBM Plex Mono 400/500 with `preload: false` for `--font-meta`.
- Drop Inter.
- Drop Playfair only after the wordmark (global header and 404) has been screenshotted in Newsreader 600 and approved. Until then Playfair stays loaded and the wordmark is unchanged.

---

## Test and screenshot checklist (all stages)

- `npm test`: `typography-floor.test.ts` (12px floor, AA on muted greys; extend the surfaces for `--color-mark*`), `escape-stack.test.tsx`, `html-utils.test.ts`, `note-action-bar.test.tsx`, `version-history-panel.test.tsx`.
- Playwright: there is no mobile project in `playwright.config.ts` today. Add a `phone` project (390×844, `isMobile`, touch) and run the new specs in it, starting from Stage 2.
- Screenshots: one `e2e/redesign-screens.spec.ts`, skipped unless `SHOTS_TAG` is set, following `typography-screens.spec.ts`. Each stage adds its surfaces at desktop 1440 / tablet 768 / phone 390 × dark and light, written to `docs/screenshots/<surface>-<viewport>-<theme>-<tag>.png`.
- Selectors to migrate as they change:
  - "All Notes" heading
  - `title="Trash"`, `title="Version history"`
  - `/^\d+ notes?$/`
  - "New note", "Share note"
  - `/notifications/i`
  - Help `dialog`

  Keep `data-testid`s (`save-status`, `wide-toggle`, `version-history-backdrop`) and `[data-note-card]` stable.
