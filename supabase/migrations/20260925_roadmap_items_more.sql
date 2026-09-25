-- More roadmap items. Guarded by title so applying it more than once is safe.
-- (Public board content lives in roadmap_items now, not src/data/roadmap.ts.)
--
-- Add your shipped features to the VALUES list below with status 'shipped'.

INSERT INTO roadmap_items (title, body, status, source, is_public, sort_order)
SELECT * FROM (VALUES
  -- Under review (considering)
  ('Public author pages', 'Considering making author pages public, so readers can find you and browse the notes you choose to share.', 'under_review', 'official', true, 5),
  -- In progress
  ('Admin tools', 'Behind-the-scenes tools to review suggestions and keep the roadmap tidy.', 'in_progress', 'official', true, 11),
  -- Planned
  ('Author pages', 'Your own profile on JustNoted — a home for who you are and the notes you share.', 'planned', 'official', true, 23),

  -- Shipped
  ('Real-time collaboration', 'Write together on a shared note and see each other''s cursors as you type.', 'shipped', 'official', true, 40),
  ('Note sharing', 'Share any note with a link, or invite specific people to view or edit.', 'shipped', 'official', true, 41),
  ('Tags', 'Tag your notes and filter down to exactly what you need.', 'shipped', 'official', true, 42),
  ('Notebooks', 'Group notes into notebooks — with covers and nested sub-notebooks.', 'shipped', 'official', true, 43),
  ('Distraction-free mode', 'A full-screen space with everything else tucked away, for deep writing.', 'shipped', 'official', true, 44),
  ('Writing goals & stats', 'Set word or character goals and track words, reading time and pages as you write.', 'shipped', 'official', true, 45),
  ('Export anywhere', 'Export notes as Markdown, MDX, TXT, HTML, JSON or XML — or a print-ready PDF.', 'shipped', 'official', true, 46),
  ('Version history', 'Look back through earlier versions of a note and restore any of them.', 'shipped', 'official', true, 47),
  ('Themes', 'Light, dark, or follow your system.', 'shipped', 'official', true, 48),
  ('Editor fonts & size', 'Pick a serif, sans or mono editor and set the text size that suits you.', 'shipped', 'official', true, 49),
  ('Works offline', 'Keep writing offline — changes save locally and sync when you''re back.', 'shipped', 'official', true, 50),
  ('Instant search', 'Jump to any note in a keystroke with quick search.', 'shipped', 'official', true, 51),
  ('Import your files', 'Open .txt and .md files straight into JustNoted.', 'shipped', 'official', true, 52),
  ('Multiple accounts', 'Switch between accounts on the same device in a tap.', 'shipped', 'official', true, 53)
) AS v(title, body, status, source, is_public, sort_order)
WHERE v.title NOT IN (SELECT title FROM roadmap_items);
