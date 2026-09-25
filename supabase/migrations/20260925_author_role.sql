-- User role / standing on authors.
--   10 = admin (full access to the admin dashboard; assertAdmin uses role >= 10)
--    3 = default active user (the default for everyone)
-- Values below 3 are reserved for moderation standing, e.g.:
--    2 = warned
--    1 = reported
--    0 = banned
-- Kept as a plain integer (no CHECK) so the scale can grow without a migration.
-- App code gates on ranges (admin: role >= 10; restricted: role < 3).
ALTER TABLE authors
  ADD COLUMN IF NOT EXISTS role INTEGER NOT NULL DEFAULT 3;

-- Bootstrap the owner as admin (run once, adjust the username/email as needed):
--   UPDATE authors SET role = 10 WHERE username = 'richardhaddadau';
-- or by email:
--   UPDATE authors SET role = 10
--     WHERE id = (SELECT id FROM auth.users WHERE email = 'richard@haddads.net.au');
