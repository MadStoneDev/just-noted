# Notebooks redesign — phased plan

Implements `03-notebooks.md`. This is the working plan; the spec is the source of
truth for behaviour, this file is the source of truth for sequencing and decisions.

Each phase ships behind the standard gate: `tsc --noEmit` + `vitest run` +
`npm run build`, committed locally, pushed only on request. Migrations are
reviewed before being applied (expand/contract, old columns kept until stable).

---

## Current code vs. spec

| Area | Today | Spec |
|---|---|---|
| Colour | `coverType`/`coverValue` (24 hexes, 12 gradients, photos) | `colour` enum (6): violet, violet-light, blue, indigo, pink, green |
| Cover | `coverType`/`coverValue` string pair | `cover` union: `{gradient}` \| `{flat, mark?}` \| `{image, url, crop}` |
| Goal | `wordGoal: number` | `goal: {type:'daily'\|'total', target} \| null` |
| Privacy | `isHidden` + `showHiddenChildren` (hide sub-notebooks) | `isPrivate` (exclude from search/profile/sharing) |
| Publish | — | `isPublished` (09-public-profile, not yet spec'd) |
| Description | — | `description ≤280` |
| Order | `displayOrder` | `sortIndex` |
| Surface | Notebooks is a **sidebar railView**; grid + detail drawer in main area | Routes `/notebooks` (grid) + `/notebooks/:id` (view), **never co-visible**; persistent sidebar **tree** |
| Depth | `parentId`; enforced client + server | Max depth 2, enforced client + API |

### Investigation findings (verified in code, 2026-10-01)

- **No auto-Inbox.** Nothing auto-creates an Inbox notebook; no migration needed.
- **Depth-2 already enforced server-side** in `createNotebook`/`updateNotebook`
  (`src/app/actions/notebookActions.ts`). Only pre-existing data may violate it.
- **Notebook cap counts every notebook** (sections included) in `createNotebook`.
- **`isHidden` is live**: `notebook-breadcrumb`, `notebook-nav-list`,
  `notebooks-grid`, and note filtering in `notes-store`. Not dead code.
- **Export** uses `select("*")` on notebooks (new columns auto-included);
  **delete-account** purges `notebooks` by `owner` (column-agnostic).
- **`writing_sessions` is per-user-per-day only** — no per-notebook/per-note word
  breakdown. Per-notebook daily goals / streaks / today-delta are NOT derivable
  today (see Open Question f).

---

## Locked decisions

1. **Covers:** map where possible, default the rest. `coverType`→`cover.type`
   cleanly; old flat hex → nearest of the 6 `colour` names, else `violet`.
2. **Expand/contract:** keep old columns (`cover_type`, `cover_value`,
   `word_goal`, `is_hidden`, `show_hidden_children`, `display_order`) until the
   new code is stable; drop them in a later CONTRACT migration.
3. **`isPrivate`:** do NOT auto-map from `isHidden`. All notebooks start
   `is_private = false`. `isHidden` behaviour is retained for now (it's in active
   use); revisit retiring it once `isPrivate` (search/profile/share exclusion)
   ships in a later phase.
4. **`isPublished`:** stub, default `false`, unused in UI until
   `09-public-profile.md` ships.
5. **`wordGoal` → `goal {type:'total', target}`** on backfill (daily goals come
   later, gated on Open Question f).
6. **Plan limit:** sections **count** toward the Draft 10-notebook cap (keeps the
   existing count-everything enforcement and the record model consistent). Flows
   through `plans.ts` (`maxNotebooks`); **`/pricing` copy updates to
   "10 notebooks (including sections)"**.
7. **Shortcuts (finalised):** Move-local-to-account becomes **menu-only** (no
   shortcut — `Shift+<letter>` types a capital while writing). "New note in this
   notebook" on a Level 2 view = **plain `N`** when no text field is focused
   (`Ctrl/⌘+Shift+N` is reserved by Chrome for incognito). **Action item:** test
   whether `Ctrl/⌘+Shift+M` ("Move to notebook") actually reaches the page in
   Chrome on Windows; if Chrome claims it, propose an alternative.
8. **Goals (finalised):** ship **total goals only**. **Hide "Daily" in the create
   sheet** and **remove the broken "words today" display wherever it currently
   shows.** Daily goals + streaks become a later sub-phase (see Open Question f).
9. **Private-while-shared (finalised):** **block** with a message listing the
   shared notes; never silently revoke.
10. **Image covers (finalised):** private R2 bucket, ≤5 MB, EXIF-strip,
    access-checked short-lived URLs. Covers migrated from `photo`/`custom` have no
    crop → **code defaults to a centred 4:3 crop when `crop` is missing**.

---

## Phase 0 — data model + API + migration (foundation)

Everything else depends on this.

- **EXPAND migration** (`supabase/migrations/20261001d_notebooks_redesign_expand.sql`,
  **await review before applying**): add `colour`, `cover` (jsonb), `description`,
  `goal` (jsonb), `is_private`, `is_published`, `sort_index`; backfill from old
  columns; keep old columns.
- Regenerate `database.types.ts` (via `npx supatypes generate`) after apply.
- **Types:** extend `src/types/notebook.ts` with the new fields (keep old fields
  during the expand window); update row↔model converters.
- **API:** `notebookActions` reads/writes the new fields. Confirm/strengthen
  depth-2 enforcement (already present). Decide cap counting per decision 6.
- **Pre-existing depth violations:** `scripts/report-notebook-depth-violations.sql`
  lists any section-under-section; fix by promoting one level (reviewed, not auto).
- **Export/delete:** export already `select("*")`; verify the new fields appear in
  the JSON and that the Markdown grouping still uses `name`. Delete-account needs
  no change (owner-scoped purge).
- **No Inbox migration** (none exists).

Shippable backward-compatibly: new columns are additive, old code keeps working.

## Phase 1 — routing & navigation shell

- Add `/notebooks` and `/notebooks/:id` as routed views, same pattern as
  Roadmap/Pricing: marker pages under `src/app/(app)/`, `NoteWrapper` renders by
  URL, `isRoutedView` in the sidebar. Grid (Level 1) and notebook view (Level 2)
  **never co-render**.
- Esc = up one level; browser back/forward + deep links work for both levels.
- Retire the current railView-based notebooks entry in favour of the route.

## Phase 2 — sidebar notebook tree

One-line rows; All/Loose fixed above a hairline; chevron only on parents with
sections (spacer otherwise); collapse persisted per user; current section
force-expands its parent; drag-over tint + 600 ms auto-expand; row `···` menu.

## Phase 3 — Level 1 grid

Top-level only; 4/3/2 columns; three cover types; meta + goal bar in the
notebook's colour; hover has no lift; empty state. Reuses/retires the current
`NotebooksGrid`.

## Phase 4 — Level 2 notebook view

Header (cover, stats, goal), Sections row (top-level only; add card; reorder),
notes list (scope toggle, section attribution, drop zone), empty state, section
differences (§5.6). Replaces the current `notebook-detail-drawer`.
**Ships with TOTAL goals only**; daily goals deferred to the Open-Question-f work.

## Phase 5 — filing, goals, counts

Drag-to-file (tree / grid card / section card / drop zone), ⇧⌘-based Move
palette (see Open Question a), move/undo toasts, Remove→Loose. Exact count/goal
rules from §7 (parent includes sections; independent goals).

## Phase 6 — mobile

No tree; grid is root; Level 2 as a pushed screen; horizontal sections scroll;
swipe actions; long-press→Move. All touch targets ≥44 px.

## Phase 7 — polish & cleanup

`isPrivate` exclusions (search / public profile / command palette); delete-confirm
Keep vs Delete-too (section→parent) using real trash retention; CONTRACT migration
to drop the old columns; retire `isHidden` if `isPrivate` fully replaces it.

---

## Open questions (proposals; designer flags noted)

**a. Shortcut conflicts (AGREED).** Move-local-to-account is now **menu-only**
(no shortcut; `Shift+<letter>` would type a capital mid-writing). "New note in
this notebook" on a Level 2 view = **plain `N`** when no text field is focused
(`Ctrl/⌘+Shift+N` is reserved by Chrome for incognito). **Still to do:** test
whether `Ctrl/⌘+Shift+M` ("Move to notebook") actually reaches the page in Chrome
on Windows — Chrome may claim it; if so, propose an alternative before Phase 5.

**b. Delete-notes-too copy.** Must read the user's real trash retention (30 free /
60 or 90 Scribe), not a hardcoded 30. Source it from the plan/user settings, same
place the privacy policy does.

**c. Making a notebook private while notes are shared.** **Proposal:** BLOCK with a
message listing the shared notes and a link to unshare, rather than silently
revoking. Never silently break collaborator access. *(Alternative: offer an
explicit "make private and revoke N shares" confirm. Prefer block-first.)*
*Designer: confirm the copy/flow.*

**d. Local notes & notebooks.** **Proposal:** only cloud notes can be filed into
notebooks; moving a note to Local makes it Loose (clears `notebookId`), with a
toast. Notebooks are a cloud-account feature.

**e. Shared-note breadcrumb.** Collaborators must NOT see the owner's notebook
names. The editor breadcrumb's notebook segments render only for the owner;
collaborators see `Cloud / <note title>` (no notebook path).

**f. Daily goals / streaks / today-delta — DEFERRED (AGREED).** `writing_sessions`
is per-user-per-day only; no per-notebook word-per-day source exists and "words
today" is known-broken. Decision: **ship TOTAL goals only.** The create sheet
**hides the "Daily" option**, and the broken **"words today" display is removed
wherever it currently shows**. Daily goals + streaks + today-delta become a later
sub-phase that adds per-note (or per-notebook) daily word tracking — a lightweight
daily-delta table keyed by note, or derived from `note_versions` diffs (TBD then).

**g. Image covers (AGREED).** Private R2 bucket, ≤5 MB, EXIF-strip,
access-checked short-lived URLs. Specifics from the data audit:
- **Today's `notebook-covers` is a PUBLIC Supabase bucket** (`full-schema-setup.sql`
  marks it public) — so private-notebook covers are currently publicly reachable.
  The image-cover phase moves custom covers to the private R2 bucket and serves
  them via access-checked short-lived URLs.
- Built-in `/covers/forest.jpg` and `/covers/ocean.jpg` exist in `public/covers/`;
  they render with the default centred 4:3 crop. No move needed (app assets).
- Two custom covers live in the public Supabase bucket; **one is still on the OLD
  cloud project `rnbzyxbugmpowkpbtdup.supabase.co`** (not self-hosted). The
  image-cover phase copies both into private R2, rewrites their cover url/key, and
  serves access-checked.

**h. "Hide private notebooks" setting.** Lives in `user_settings`, surfaced under
Settings → Editor, default **off** (per §7). Wire in Phase 7 with the `isPrivate`
exclusions.

---

## Legacy cloud-project decommission (`rnbzyxbugmpowkpbtdup.supabase.co`)

The only **live** dependency on the old Supabase cloud project is the two custom
notebook-cover image URLs (above). All other references are **dead one-time
tooling**: `scripts/migrate-data.sh`, `scripts/migrate-storage-files.sh`,
`scripts/fix-storage-urls.sql`. Once the image-cover phase has copied those covers
into R2 and rewritten their URLs, nothing live points at the old project and it can
be decommissioned; the migration scripts can be archived/removed.
