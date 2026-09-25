# JustNoted — Roadmap

Living planning doc. The build order below is the priority; each big feature is
broken into shippable phases so it can go out independently.

---

## Build order (what's next)

1. ✅ **Roadmap page (kanban board)** — standalone page, own rail entry, kanban
   columns by status. Read-only for now (from `src/data/roadmap.ts`); voting +
   suggestions + admin drag are the next phases. Help→Roadmap modal removed.
2. **Collab identity fixes** — caret shows the real username (not "Someone"),
   broadcast live on resolve/change; email-local-part fallback. Small, high-annoyance.
3. **Shared note consistency — finish** — Export / Print / History parity across
   shared surfaces; optional owner-set per-note page size (needs a `page_format`
   column). (Title + stats already shipped.)
4. **Roadmap voting & suggestions** — move the roadmap into Supabase so users can
   upvote items and submit suggestions (4 phases, below). Slots wherever you like.
5. **Note Conversations** — per-note chat + anchored comments (5 phases, below).
6. **Notifications** — in-app → prefs → email digest → push (4 phases, below).

Parked: performance investigation (improved; revisit if it regresses).
Deferred: anonymous / public-only sharing for Redis users.

---

## Shipped (awaiting deploy)

- Tiered **Trash retention** (Draft 30d / Scribe 60–90d) + Settings toggle + 91-day purge cron.
- **Scribe = unlimited notebooks.**
- Shared notes render **Markdown** correctly (no more raw-HTML wall of text).
- **Update-available banner** (flushes the open note, then reloads).
- **Help & Keyboard Shortcuts** modal (replaces the old `/the-how` page).
- **Restore last-viewed shared note** on refresh.
- Shared notes match the editor **title + show stats** (read-only).
- **Roadmap page** (kanban board) on its own rail entry, read-only for now
  (Help→Roadmap modal removed).

---

## Roadmap page (kanban board) — ✅ v1 shipped (read-only)

A **standalone page** with its **own permanent left-rail entry** (`roadmap-view.tsx`),
opened via a rail button + `justnoted:open-roadmap`, behaving like Settings/Trash
(Esc/close returns to notes). Kanban columns (Under review / Planned / In progress
/ Shipped) from `src/data/roadmap.ts`. The Help→Roadmap modal was removed. Still
to come: voting, suggestions, and admin drag-to-reprioritise (below).

- **Layout: a kanban board** — columns by status, cards per item:
  **Suggestions / Under review → Planned → In progress → Shipped**
  (exact columns TBC). Cards show title, blurb, and a vote count / upvote control.
- **Public & read-only for users:** anyone can browse and upvote; a "Suggest a
  feature" action adds a card to the first column (pending admin approval).
- **Admins** can drag cards between columns (= change status), edit, and remove —
  the write side of the Admin dashboard's "Roadmap items", surfaced on the board.
- Data comes from Supabase (`roadmap_items` / `roadmap_votes`, see below), not the
  static `src/data/roadmap.ts` — that file was the interim source and becomes the
  seed.
- **Interim state (to redo):** the current Help→Roadmap modal list reads
  `src/data/roadmap.ts`. It ships as a stopgap but is superseded by this page.

**Open questions to confirm before building:** exact columns; is the board public
to logged-out visitors or members-only; does dragging require admin (yes) or also
allow a trusted role; keep a Help→Roadmap shortcut that just opens the page?

---

## Roadmap voting & suggestions

Evolves the read-only Roadmap into a lightweight public feedback board (vote on
items, submit suggestions). This is persistent, per-user, cross-device state, so
it moves off the static `src/data/roadmap.ts` into Supabase. `roadmap.ts` becomes
the **seed** for the official items.

**Data model**
- `roadmap_items` — `id`, `title`, `body`, `status` (`under_review` | `planned` |
  `in_progress` | `shipped` | `declined`), `source` (`official` | `community`),
  `is_public` (bool), `vote_count` (denormalised), `created_by` (nullable), 
  `sort_order`, `created_at`, `updated_at`. Official items and approved community
  suggestions live in the one table (a `source` flag distinguishes them).
- `roadmap_votes` — `id`, `item_id` FK, `user_id` (nullable, auth voters),
  `voter_key` (nullable, guest cookie/localStorage token), `ip` (soft signal),
  `created_at`. Dedup via two partial unique indexes: `(item_id, user_id) where
  user_id is not null` and `(item_id, voter_key) where voter_key is not null`. A
  trigger keeps `roadmap_items.vote_count` in sync for cheap sorting.

**Voting is open to guests** (decided). Signed-in users vote by `user_id`; guests
vote with a `voter_key` we set in a cookie/localStorage, with IP as a soft
secondary/rate-limit signal. This is **best-effort dedup, not airtight** — a guest
can clear storage or use incognito, and IPs are shared/rotating — but votes are
low-stakes so that's an acceptable trade. Voting goes through a **server route**
(service-role) so it can set the cookie, read the IP, and enforce dedup — guests
can't insert via client RLS.

**RLS**
- items: public read where `is_public`; INSERT by authenticated users (creates a
  `community` / `under_review` / `is_public=false` suggestion); UPDATE/DELETE
  service-role only (moderation via the admin dashboard).
- votes: all writes go through the server route (service-role); no direct client
  insert.

**Phases**
- ✅ **P1 — DB + seed:** `roadmap_items` (seeded from the curated list); the page
  reads from Supabase via `getRoadmap()`.
- ✅ **P2 — Voting:** `roadmap_votes` + count trigger + `toggleVote()` server
  action (guest `voter_key` cookie + IP; member `user_id`); upvote UI with count
  + voted state.
- ✅ **P3 — Suggestions:** "Suggest" form → `submitSuggestion()` creates a
  `community` item, hidden pending admin approval.
- ⬜ **P4 — Moderation:** lives in the **Admin dashboard** (below) — approve /
  reject / re-status / merge / reorder; notify a suggester when their item ships.
  Until the admin UI exists, approve suggestions via SQL
  (`UPDATE roadmap_items SET is_public=true, status='planned' WHERE id=…`).

**Decisions**
- **Guests can vote** ✅ — deduped by cookie/localStorage `voter_key` (+ IP as a
  soft signal); members by `user_id`. Best-effort, server-enforced.
- **Suggestions require admin approval** ✅ — `is_public=false` until an admin
  publishes them from the dashboard.

---

## Admin dashboard

An in-app admin area, opened from a rail button **above Help** (only rendered for
admins). Mirrors Settings: its own left nav of focus areas + a main panel.

**Access control**
- `authors.role` (integer): **10 = admin**, **3 = default** active user. Lower
  values reserved for moderation standing — e.g. `2` warned, `1` reported,
  `0` banned. Admin = `role >= 10`. Bootstrap the owner via SQL.
- **Every** admin action runs server-side through `adminActions` with an
  `assertAdmin(session)` gate (`role >= 10`) + service-role client — never trust
  the client. The rail button/view render off an `amIAdmin()` check but that's
  cosmetic; the server is the gate.
- The same `role` scale later powers moderation (warn/report/ban) — gates that
  restrict a user's actions check `role`, so this one column serves both.

**Sections (left nav)**
1. **Users** — list (username, email, tier, note count, joined, last active);
   quick actions (comp/revoke Scribe — replaces the manual SQL, adjust plan);
   click → detail.
2. **Notes** — list across users (title, owner, updated, word count); quick
   actions (soft-delete / restore). **Privacy:** metadata-first; opening full note
   content is sensitive (users' private writing) — gate it behind an explicit
   action and consider logging it.
3. **Roadmap suggestions** — moderation queue: approve → publish (`is_public`,
   set status/source), decline, edit, merge duplicates into an existing item.
4. **Roadmap items** — CRUD: add / edit / remove, reorder, set status, and **see
   who voted** (member usernames + guest count) and fix vote issues.

**Phases**
- ✅ **P1 — Shell + gate:** `assertAdmin`/`amIAdmin` on `authors.role >= 10`, rail
  button (admins only, `justnoted:open-admin`), `AdminView` with section nav.
- ✅ **P2 — Roadmap admin:** suggestions moderation (approve/decline) + items
  CRUD (add/edit/status/public/reorder/delete) in the dashboard.
- ✅ **P3 — Users:** list (email/username/role/plan), search, set role
  (banned/reported/warned/active/admin), grant/revoke Scribe from the UI.
- ✅ **P4 — Notes:** metadata list (title/owner/updated + trashed/private flags),
  search, trash/restore. Content view intentionally omitted (privacy) — add later
  behind an explicit, audited action.

Admin dashboard is feature-complete for v1.

**Decisions**
- Admin identity: ✅ `authors.role` (10 = admin, 3 = default; room for
  banned/reported/warned below 3). Migration added; bootstrap the owner to 10.
- Notes section: metadata-only by default; full-content view is opt-in + logged.

---

## Note Conversations

A conversation attached to each note: rich chat **plus** the ability to anchor a
message to a specific line/word in the note, with two-way navigation between the
text and the thread.

**Core interactions**
- Fixed toggle button pinned mid-right of the viewport opens/closes a
  conversation panel docked to the right.
- Anchor a message to a highlighted word/line. In the note, the anchor is a
  tappable marker; tapping it opens the panel focused on that message. In the
  thread, an anchored message shows a chip; tapping it scrolls the note to the
  highlight and flashes it.
- Rich input: text, emoji, images (incl. paste), GIFs.

**Responsive behaviour**
- **Desktop:** opening the panel forces a split view — note and conversation
  side by side.
- **Tablet:** opening the panel auto-collapses the notes sidebar (screen is
  tight; user can reopen it). Requires a sidebar hide/show control (Phase 2).
- **Mobile:** the panel is full-screen. Tapping a marker in the note closes the
  panel and scrolls to the anchor; tapping an anchored word/line opens the panel
  at that message.

**Decisions**
- **Gating:** ✅ Conversations are gated (Scribe / shared notes), consistent with
  collaboration.
- **Realtime transport:** ✅ **Supabase Realtime Postgres-changes.** Messages are
  written to `note_messages` (the source of truth, durable history for free) and
  streamed to open clients; realtime is delivery on top, not a separate ephemeral
  channel.
- **Access model** (still open): reuse `shared_notes` + `shared_notes_readers`
  roles. Possibly add a `'comment'` link-permission level alongside `view`/`edit`.

### Phase 1 — Conversation panel + basic chat (foundation)
- **Data:** `note_messages` table (`id`, `note_id` FK, `author_id`, `body`,
  `created_at`, `edited_at`, `deleted_at`). RLS locked to service role; access
  enforced in server actions that derive participants from note ownership +
  `shared_notes` (mirror the `collabActions.resolve` pattern).
- **Server actions:** list / send / edit / soft-delete messages, access-checked.
- **Realtime:** subscribe to new/edited messages for the open note.
- **UI:** right-docked panel + fixed mid-right toggle; desktop split view; text
  messages only; sender identity from `authors.username`; timestamps + grouping.
- Toggle button only shows where the user has access to the note.

### Phase 2 — Responsive layout + sidebar control
- Desktop split with a fixed (later resizable) panel width.
- **New sidebar hide/show toggle** (reclaims width; a general UX win beyond chat).
- Tablet: opening chat auto-collapses the notes sidebar; reopenable.
- Mobile: full-screen chat overlay with smooth open/close.
- Persist panel open-state / width per device (localStorage; per-viewer only).

### Phase 3 — Anchored comments (the marker system)  ⚠ highest technical risk
- Selection → "Comment on this" affordance in the editor selection toolbar.
- **Anchor model built to survive edits and collab:**
  - Collab notes: store a **Yjs RelativePosition** so the anchor tracks the text
    through concurrent edits.
  - Fallback / non-collab: a **text-quote anchor** (exact quote + prefix/suffix
    context + approximate offset), re-resolved on load (Hypothesis-style fuzzy
    re-anchoring).
- Render anchors as ProseMirror **decorations** (highlights); messages carry an
  anchor chip.
- **Two-way navigation** + flash-on-focus, on all breakpoints (see Mobile above).
- Graceful **orphaned anchors** when the underlying text is deleted ("anchor
  lost", keep the message).
- Recommend a small spike here before committing to the model.

### Phase 4 — Rich media & input
- Image upload + **paste** (Supabase Storage; reuse the existing buckets/RLS from
  `20260330_storage_buckets` and client compression in `utils/image/compress`).
- GIF picker (Giphy/Tenor).
- Emoji picker.
- (Optional) link previews.

### Phase 5 — "Smarter" & polish
- Unread badges (on the toggle + notes list), read state.
- `@mentions` of collaborators + notifications.
- Typing indicators + presence (reuse `use-presence`).
- Reactions; resolve/archive a thread or an anchored comment.
- **AI (Scribe):** summarise a thread, "turn this discussion into an edit",
  suggested replies — the "smarter" layer.
- Search within a conversation.

---

## Shared note consistency

Making shared notes look like normal notes (they were a bespoke surface).

- ✅ Editor **title** styling (`var(--font-editor)`, same sizes).
- ✅ **Stats row** (words · chars · reading time · page estimate · goal), read-only.
- ✅ Owner's **goal/progress** shown read-only.
- ⬜ **Export / Print / History** parity across shared surfaces (editable has
  History/Copy-link/⋯; read-only has Print/Back — not a uniform Export).
- ⬜ Owner-set **per-note page size** — needs a `page_format` column (page size is
  currently editor-local, so there's no stored owner value to display).
- Later: **full editor reuse** — render shared notes through the real editor in a
  read-only/limited mode (cleaner end-state, bigger refactor) rather than the
  additive approach shipped above.

## Notifications

A cross-cutting notifications system (its own Settings section already stubbed).

- **Phase 1 — In-app:** a notification centre (bell + unread count). Events:
  someone commented / mentioned you in a Note Conversation, a collaborator edited
  a shared note, a share was granted to you. Backed by a `notifications` table +
  Realtime, mirroring the conversations transport decision.
- **Phase 2 — Preferences:** per-type toggles in the Notifications settings
  section; mute-per-note.
- **Phase 3 — Email digest:** batched email for unread items (reuse the existing
  `docs/email-templates`), respecting preferences.
- **Phase 4 — Push (optional):** web push for mentions/replies.
- Ties into Conversations Phase 5 (`@mentions`, unread badges) and collaboration.

---

## Backlog / related
- In-app **Roadmap** page (Help menu item) that renders this document.
- Live collab identity: propagate a mid-session username change to peers without
  a refresh (currently the collab name is captured once at editor mount). ← fix
  drafted (live awareness update); see caret discussion.
- ✅ Restore last-viewed **shared** note on refresh (done — `note-wrapper`).
