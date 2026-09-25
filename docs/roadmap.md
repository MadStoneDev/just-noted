# JustNoted — Roadmap

Living planning doc. The build order below is the priority; each big feature is
broken into shippable phases so it can go out independently.

---

## Build order (what's next)

1. ✅ **In-app Roadmap page** — shipped. Help → Roadmap opens a curated public
   list (source: `src/data/roadmap.ts`, separate from this internal doc).
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
- **In-app Roadmap page** (Help → Roadmap), curated from `src/data/roadmap.ts`.

---

## In-app Roadmap page ✅ shipped

Help → **Roadmap** opens a user-facing view (In progress / Planned / Recently
shipped) with short, benefit-focused blurbs.
- **Decision (resolved):** a **separate curated public list** — `src/data/roadmap.ts`
  — not this internal doc, so file paths / DB tables / open decisions never leak.
  Edit that file to change what users see.
- Follow-ups (optional): a dedicated full-page view if the list outgrows the
  modal; per-item links to changelog/blog posts once those exist.

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
- `roadmap_votes` — `id`, `item_id` FK, `user_id`, `created_at`, **unique
  (`item_id`, `user_id`)** (one vote per user per item; toggle to unvote). A
  trigger keeps `roadmap_items.vote_count` in sync for cheap sorting.

**RLS**
- items: public read where `is_public`; INSERT by authenticated users (creates a
  `community` / `under_review` / `is_public=false` suggestion); UPDATE/DELETE
  service-role only (moderation).
- votes: users insert/delete their own; count is the denormalised column.

**Phases**
- **P1 — DB + seed (read only):** create `roadmap_items`, seed from `roadmap.ts`,
  switch the Roadmap view to fetch from Supabase. Minimal behaviour change.
- **P2 — Voting:** `roadmap_votes` + trigger + vote/unvote server actions; upvote
  UI with count + voted state; sort Planned/Under-review by votes.
- **P3 — Suggestions:** "Suggest a feature" form (authenticated) → creates a
  community item; basic validation + rate-limit.
- **P4 — Admin & moderation:** approve / reject / re-status / merge duplicates /
  reorder (SQL/dashboard first, small admin UI later); notify a suggester when
  their item ships (ties into Notifications).

**Decisions**
- **Voting requires an account** (rec: yes — prevents ballot-stuffing; guests get
  a "sign in to vote" nudge). Anonymous/Redis users have no auth id → account
  required to vote or suggest, consistent with other gating.
- **Suggestions moderated-first** (`is_public=false` until approved) vs. an open
  board (visible under "Under review" immediately). Rec: **moderated-first** to
  start (spam/abuse control), revisit if engagement warrants an open board.

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
