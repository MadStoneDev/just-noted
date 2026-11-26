-- Roadmap refresh, November 2026. Moves finished items to Shipped, hides items
-- that no longer apply, removes em-dashes from descriptions and adds recently
-- shipped work. Keyed by title, so applying more than once is safe. Hidden rows
-- keep their votes (is_public = false only takes them off the board).

-- 1. Finished: move to Shipped.
UPDATE roadmap_items SET status = 'shipped', sort_order = 16, updated_at = now(),
  body = 'Chat on any shared note, and pin a comment to a specific line or word so everyone knows exactly what you mean.'
WHERE title = 'Note conversations' AND source = 'official';

UPDATE roadmap_items SET status = 'shipped', sort_order = 17, updated_at = now(),
  body = 'Export, print and version history on every shared note, not just your own.'
WHERE title = 'Richer shared notes' AND source = 'official';

-- 2. No longer true or not a user feature: take off the board.
UPDATE roadmap_items SET is_public = false, updated_at = now()
WHERE source = 'official' AND title IN (
  'Distraction-free mode',
  'Admin tools',
  'Smarter conversations',
  'Public author pages'
);

-- 3. Remove em-dashes from existing descriptions.
UPDATE roadmap_items AS r SET body = v.body, updated_at = now()
FROM (VALUES
  ('Author pages', 'Your own profile on JustNoted: a home for who you are and the notes you share.'),
  ('Notebooks', 'Group notes into notebooks, with covers and nested sub-notebooks.'),
  ('Export anywhere', 'Export notes as Markdown, MDX, TXT, HTML, JSON or XML, or as a print-ready PDF.'),
  ('A safer Trash', 'Deleted notes wait in Trash before they''re gone: 30 days on Draft, up to 90 on Scribe.'),
  ('"Update ready" prompt', 'When a new version ships, we''ll offer a refresh and save your note first.'),
  ('Unlimited notebooks on Scribe', 'Organise as much as you like, with no notebook cap on Scribe.'),
  ('Works offline', 'Keep writing offline. Changes save locally and sync when you''re back.')
) AS v(title, body)
WHERE r.title = v.title AND r.source = 'official';

-- 4. Recently shipped (listed first in Shipped).
INSERT INTO roadmap_items (title, body, status, source, is_public, sort_order)
SELECT * FROM (VALUES
  ('Yearly Scribe', 'Pay yearly and get two months free: A$70 a year instead of A$7 a month.', 'shipped', 'official', true, 1),
  ('Sync you can trust', 'Your latest edit wins, whichever tab or device it came from.', 'shipped', 'official', true, 2),
  ('Safe sign-out', 'Signing out checks your writing has synced first, and warns you if it hasn''t, even offline.', 'shipped', 'official', true, 3),
  ('Deletes that stick', 'A deleted note stays deleted, on every tab and device.', 'shipped', 'official', true, 4),
  ('Reliable Undo', 'If Undo can''t finish, your note is kept until you try again or discard it.', 'shipped', 'official', true, 5),
  ('Empty lines stay put', 'Blank lines you add on purpose survive saving and reloading.', 'shipped', 'official', true, 6),
  ('Easier-to-read small text', 'Dates, word counts and labels are bigger and clearer.', 'shipped', 'official', true, 7),
  ('Accounts remember your place', 'Each account reopens the note you were last working on.', 'shipped', 'official', true, 8),
  ('Trash on your phone', 'Trash now opens properly on small screens.', 'shipped', 'official', true, 9),
  ('Shared-with-you alerts', 'Get told in the app, or by email, when someone shares a note with you.', 'shipped', 'official', true, 10),
  ('Free writing tools', 'A word counter, case converter, slug generator and more, free to use.', 'shipped', 'official', true, 11),
  ('Split view', 'Keep a reference note open beside the one you''re writing.', 'shipped', 'official', true, 12),
  ('Text highlights', 'Highlight text in your notes.', 'shipped', 'official', true, 13),
  ('Your data, your call', 'Export your whole account, or delete it yourself, any time.', 'shipped', 'official', true, 14),
  ('Recovery key', 'Get your local notes back on another browser with a recovery key.', 'shipped', 'official', true, 15)
) AS v(title, body, status, source, is_public, sort_order)
WHERE v.title NOT IN (SELECT title FROM roadmap_items);
