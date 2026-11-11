-- Share link permission level (design surface 04 — share sheet & permissions).
--
-- The share sheet's "Anyone with the link" select has four states. This column
-- records that level per shared note, alongside the existing is_public flag.
--
--   'off'       - link revoked; no anonymous access (is_public also false)
--   'view'      - anyone with the link can view (unlisted). Anonymous allowed.
--   'edit'      - signed-in visitors can edit. Anonymous editing unsupported;
--                 the app must require authentication before accepting an edit.
--   'published' - listed on the author's public page and indexable
--                 (public profile — surface 13; not enforced by this migration).
--
-- Permissions are enforced server-side in app/actions/sharing.ts, not only in
-- the UI. 'edit' in particular must verify an authenticated reader before a
-- write is accepted.

ALTER TABLE shared_notes
  ADD COLUMN IF NOT EXISTS link_permission TEXT NOT NULL DEFAULT 'view';

-- Backfill existing rows from is_public: previously every share was view-only,
-- so an active public share maps to 'view' and a specific-people share (link
-- not public) maps to 'off' for the link (named readers are unaffected).
UPDATE shared_notes
  SET link_permission = CASE WHEN is_public THEN 'view' ELSE 'off' END
  WHERE link_permission = 'view';

-- Guard the allowed values.
ALTER TABLE shared_notes DROP CONSTRAINT IF EXISTS shared_notes_link_permission_check;
ALTER TABLE shared_notes
  ADD CONSTRAINT shared_notes_link_permission_check
  CHECK (link_permission IN ('off', 'view', 'edit', 'published'));
