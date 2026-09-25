# JustNoted — Roadmap

Living planning doc. The build order below is the priority; each big feature is
broken into shippable phases so it can go out independently.

---

## Build order (what's next)

1. **In-app Roadmap page** — surface this roadmap in the app (Help → Roadmap) so
   users can see what's shipped and coming. Small; do first.
2. **Collab identity fixes** — caret shows the real username (not "Someone"),
   broadcast live on resolve/change; email-local-part fallback. Small, high-annoyance.
3. **Shared note consistency — finish** — Export / Print / History parity across
   shared surfaces; optional owner-set per-note page size (needs a `page_format`
   column). (Title + stats already shipped.)
4. **Note Conversations** — per-note chat + anchored comments (5 phases, below).
5. **Notifications** — in-app → prefs → email digest → push (4 phases, below).

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

---

## In-app Roadmap page

Surface this roadmap inside the app so users can see what's shipped and planned
(the Help menu already has a stubbed "Roadmap" item).
- Help → **Roadmap** opens a user-facing view: "Shipped / In progress / Planned"
  with short, public-friendly blurbs — not the engineering notes.
- **Decision:** render `docs/roadmap.md` directly, or maintain a separate curated
  public list? Recommended: a **separate public list**, so internal detail (file
  paths, DB tables, open decisions) never leaks to users.

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
