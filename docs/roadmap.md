# JustNoted — Roadmap

Living planning doc. Near-term work is roughly ordered; the big features are
broken into shippable phases so each one stands on its own.

---

## In progress / awaiting commit

### Help & Keyboard Shortcuts (design surface 08)
Built, currently uncommitted (`src/components/help-modal.tsx` + wiring in
`note-wrapper.tsx`). Rail "Help" button → `justnoted:open-help` → `HelpModal`,
with **Keyboard Shortcuts** rendered inline from `KEYBOARD_SHORTCUTS`. Remaining
menu items (Articles, How it works, About, Roadmap) are stubbed "soon".
- **To finish:** commit it; then wire the stubbed destinations as they're built
  (the "Roadmap" item can eventually render this document in-app).

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

Shared notes currently render as a bespoke surface (`shared-note-page`,
`shared-note-inline`) that looks nothing like the normal editor: different title
font/size, no stats (word/char count, reading time), no page-size or goal
display. They should look like a normal note.

- Match the editor's **title** styling (`var(--font-editor)`, same sizes).
- Show the same **stats row** (word count · char count · reading time · page
  estimate) via `use-note-statistics`.
- Show the owner's **page size** and **goal/progress** if set — **read-only** for
  non-owners (only the owner can change them).
- Keep the existing **Export / Print / History** actions.
- **Approach (to confirm):** reuse the real editor chrome in a read-only/limited
  mode vs. add the missing chrome to the shared views. Reuse is the cleaner
  end-state but a bigger refactor (the editor is wired to the notes store + save
  paths); the additive route ships the visible consistency faster.

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
