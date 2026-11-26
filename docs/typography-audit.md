# Small text & muted contrast audit (2026-11-26)

The smallest UI text (10–11.5px, often in a 3:1 grey) was hard to read across the app:
Trash column headers, word counts, dates, sidebar card metadata, Version history, Settings hints.

## Fix at the source

**Sizes.** Two tokens in `src/app/globals.css` (`@theme`) are now the floor for UI chrome:

| Token | Size | Use |
|---|---|---|
| `text-label` | 12px / 16px | labels, column headers, eyebrows, chips, badges, kbd |
| `text-meta` | 13px / 18px | metadata: word counts, dates, durations, footers, hints |

Every arbitrary `text-[8px]`…`text-[11.5px]` in components now points at one of them, so the
floor changes in one place. Metadata that was already 12px (Trash notebook cell, sidebar
card dates/readers/owner, notebook meta line, chat footer, breadcrumb counts, page footers)
moved to `text-meta`. 12–12.5px descriptive copy (dialog text, settings help) was left alone.
`src/typography-floor.test.ts` fails on any new `text-[<12px]` class.

Exempt (out of scope): the formatting toolbar, the editor body, and the 9px collaborator
caret flag inside the editor (`.ProseMirror-yjs-cursor`). The SERP mock in Tools keeps
Google's inline sizes on purpose.

**Colour.** The muted greys were raised in place, so every use of the token follows:

| Theme | Token | Old | New | Contrast old → new |
|---|---|---|---|---|
| dark | `ink-4` | #7D8785 | #889391 | on #0E1111 5.13 → **5.99**; on #121616 4.93 → **5.75**; on #050606 5.48 → **6.40**; on #141818 4.84 → **5.65** |
| dark | `ink-5` | #5F6867 | #798483 | on #0E1111 3.31 → **4.92**; on #121616 3.18 → **4.72**; on #050606 3.54 → **5.26**; on #141818 3.12 → **4.64** |
| dark | `text-tertiary` | #707070 | #8D8D8D | on #0E1111 3.83 → **5.72**; on #121616 3.68 → **5.49**; on #0E1211 3.81 → **5.68**; on #222625 3.09 → **4.61** |
| light | `ink-5` | #6B7573 | #656F6D | on #FBFCFB 4.62 → **5.04**; on #EFF2F1 4.22 → **4.61** |
| light | `text-tertiary` | #9A9A9A | #6F6F6F | on #FFFFFF 2.81 → **5.02**; on #F5F5F5 2.58 → **4.61** |

All new values are ≥ 4.5:1 (WCAG AA) on every surface small text sits on, in both themes
(asserted in `src/typography-floor.test.ts`). Hierarchy holds: on #0E1111 primary ink is
16.7:1, ink-3 7.3:1, ink-4 6.0:1, ink-5 4.9:1. `ink-6`/`ink-7` are unchanged; they stay
for disabled states, placeholders, dots and separators, and the nine places that used
`ink-6` for real text (timestamps, "(edited)", export expiry, empty states) now use `ink-5`.

## Layout fixes found while checking

- Sidebar notebook chip: the name was clipped mid-letter (no ellipsis). It now truncates
  with an ellipsis and has 180px instead of 150px.
- Trash on phone opened off-screen (to the right of the full-width note list), before this
  change too. Opening Trash on a phone now hides the list, like opening a shared note does.
  The header wraps its buttons under the title on narrow screens.

## Inventory (changed sites, grouped by component)

- `src/app/error.tsx`: xs → meta
- `src/app/not-found.tsx`: xs → meta
- `account-menu.tsx`: 10.5px → meta ×2, 10px → label ×2
- `account-switch-modal.tsx`: 10px → label, 11px → meta
- `active-note-editor.tsx`: 10px → label ×4, 10px → meta ×2, 11px → label ×3, 11px → meta ×4
- `add-shared-drawer.tsx`: 11px → label, 11px → meta
- `admin-view.tsx`: 10px → label ×4, 10px → meta, 11.5px → label ×2, 11.5px → meta, 11px → meta ×4
- `billing-interval-toggle.tsx`: 10.5px → label
- `bulk-action-bar.tsx`: 11px → label
- `chat-drawer.tsx`: 9px → label
- `ds/badge.tsx`: 10px → label
- `ds/command-palette.tsx`: 10.5px → label, 11px → meta ×3
- `editor/link-popover.tsx`: 10px → meta
- `editor/slash-menu.tsx`: 10px → meta
- `global-footer.tsx`: xs → meta
- `goal-suggestions-modal.tsx`: 10px → meta ×2, 9px → meta
- `help-modal.tsx`: 10px → label, 11px → label
- `mobile-account-drawer.tsx`: 11px → meta ×2
- `mobile-chrome.tsx`: 10.5px → label ×4
- `note-chat-panel.tsx`: 10.5px → meta, 10px → meta, 11.5px → meta ×3, 11px → meta ×2, 12px → meta, ink-6 → ink-5 (colour) ×3
- `note-stats-row.tsx`: 11px → meta
- `note-view/note-action-bar.tsx`: 11px → label
- `note-view/note-view.tsx`: 10px → label ×3, 10px → meta ×2, 11px → meta ×3
- `notebook-breadcrumb.tsx`: xs → meta ×3
- `notebook-move-menu.tsx`: 11px → label
- `notebook-nav-list.tsx`: 10px → meta ×2, 11px → meta ×6
- `notebook-view.tsx`: 10px → label, 11px → label, 11px → meta, 12px → meta
- `notebooks-grid.tsx`: 10px → label, 10px → meta ×2, 11.5px → meta, 11px → meta, ink-6 → ink-5 (colour)
- `notes/note-card.tsx`: 11px → label ×3, 11px → meta ×4, 12px → meta
- `notifications-view.tsx`: 10.5px → meta, 11.5px → meta, ink-6 → ink-5 (colour)
- `presence-stack.tsx`: 11px → label
- `pricing-view.tsx`: 10px → label, 11px → label ×2, 11px → meta ×3
- `profile-block.tsx`: 11px → meta ×3
- `roadmap-view.tsx`: 10px → label, 11.5px → meta, 11px → label, 11px → meta ×3, ink-6 → ink-5 (colour) ×2
- `search-modal.tsx`: 10px → meta, 8px → label, 9px → label, 9px → meta
- `settings-view.tsx`: 10.5px → meta, 10px → meta, 11.5px → meta ×5, ink-6 → ink-5 (colour)
- `settings/account-export-section.tsx`: 11.5px → meta ×2, 11px → meta, ink-6 → ink-5 (colour)
- `settings/billing-section.tsx`: 10px → label, 11.5px → label, 11.5px → meta, 11px → label ×3, 11px → meta ×2
- `share-note-button.tsx`: 10px → label ×4, 11.5px → label, 11.5px → meta, 11px → label, 11px → meta
- `shared-history-panel.tsx`: 10px → label, 11px → meta
- `shared-nav-list.tsx`: 10px → label ×2, 11px → label, 11px → meta ×2, 12px → meta ×3
- `shared-note-inline.tsx`: 11px → meta ×2
- `shared-note-page.tsx`: 10px → meta, 11px → meta ×3
- `sidebar/index.tsx`: 10px → meta, 11px → label ×5, 11px → meta, 8px → label, 9px → label
- `sidebar/notebook-tree.tsx`: 11px → meta ×4
- `tag-filter.tsx`: 10px → label ×2
- `tag-picker.tsx`: 10px → label
- `tools/case-converter.tsx`: 10px → label ×3, 11px → meta
- `tools/og-tester.tsx`: 10px → label, 11.5px → meta
- `tools/serp-preview.tsx`: 10px → label ×4, 11.5px → meta ×2
- `tools/slug-generator.tsx`: 10px → label ×3, 11.5px → meta ×3
- `tools/tools-grid.tsx`: 10px → label
- `tools/word-counter.tsx`: 10px → label ×2, 11.5px → meta ×3
- `trash-view.tsx`: 10.5px → meta, 10px → label, 11.5px → meta ×2, 11px → meta ×2, 12px → meta ×2
- `ui/offline-indicator.tsx`: 10px → label
- `version-history-panel.tsx`: 10px → label ×3, 10px → meta ×6, 11px → meta ×2
- `writing-session-indicator.tsx`: 10px → meta

Totals: 11px → meta ×64, 10px → label ×50, 11.5px → meta ×27, 11px → label ×26, 10px → meta ×25, ink-6 → ink-5 (colour) ×9, 12px → meta ×8, xs → meta ×6, 10.5px → meta ×6, 10.5px → label ×6, 11.5px → label ×4, 9px → label ×3, 9px → meta ×2, 8px → label ×2

## Screenshots

`docs/screenshots/<surface>-<viewport>-<theme>-{before,after}.png`: Trash, sidebar,
Version history (list + preview), Settings (Appearance, Account, Plan & usage), desktop
1440×900 and phone 390×844, dark theme, plus Trash in light. Regenerate with
`SHOTS_TAG=after npx playwright test typography-screens` (see `e2e/typography-screens.spec.ts`).
The phone "before" Trash shot shows the note list because Trash was off-screen on phones then.
