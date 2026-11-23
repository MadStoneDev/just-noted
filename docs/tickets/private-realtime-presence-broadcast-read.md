# Private presence: add a broadcast-read policy before NEXT_PUBLIC_PRIVATE_REALTIME goes on

- **Status:** open. Blocks turning on `NEXT_PUBLIC_PRIVATE_REALTIME`.
- **Severity:** blocker for the private-realtime rollout. Inert while the flag is off.
- **Area:** realtime authorisation. `supabase/migrations/20261003000000_realtime_presence_authz.sql`, `src/hooks/use-presence.ts`, `e2e/realtime-sync.spec.ts`

## Problem

Realtime v2.1xx (local is v2.129.3) authorises a `private: true` channel join
by checking **broadcast read**. Migration `20261003000000` was written for
v2.76.5 and only grants `presence` (the `presence_receive` / `presence_send`
policies on `realtime.messages` both require `extension = 'presence'`). So
the join is refused for everyone, including the note's owner and its share
recipients. If the flag were turned on today, presence would stop working for
all users.

## Fix

- **Presence is for the owner and share recipients only.** Public-link viewers
  must not see who is in the note. `can_access_note_live` is not the right gate:
  it also admits anyone when `shared_notes.is_public = true`. Add either:
  - a separate `security definer` check, e.g. `can_see_note_presence(p_note_id)`:
    the note exists and is not trashed, and the caller is `notes.author` or a
    `shared_notes_readers.reader_id`, with **no** `is_public` branch; or
  - a parameter on the existing function, e.g.
    `can_access_note_live(p_note_id, p_include_public boolean default true)`,
    so the yjs/content callers keep their current behaviour.
- New migration: a `SELECT` policy on `realtime.messages` for
  `extension = 'broadcast'` on `presence:<noteId>` topics, gated by that
  owner/recipient-only check. It admits the owner and share recipients, and
  denies outsiders, public-link-only viewers and trashed notes.
- Move the existing `presence_receive` / `presence_send` policies to the same
  check. They use `can_access_note_live` today, so a public-link viewer
  could currently join presence on a public note.
- Don't add a broadcast `INSERT` policy unless the client actually sends
  broadcasts on that topic.

## Done when

- The `test.fixme("private presence admits the owner and the share recipient")`
  in `e2e/realtime-sync.spec.ts` is changed to `test(...)` and passes.
- The existing "outsider refused" test still passes.
- New test: a signed-in user who is not the owner or a share recipient
  is refused `presence:<noteId>` on a note that has a public link
  (`is_public = true`).
- `scripts/verify-realtime-presence.mjs` passes with two test accounts.
- Only after all of the above: turn on `NEXT_PUBLIC_PRIVATE_REALTIME` (the
  `docs/mobile-readiness.md` checklist item).
