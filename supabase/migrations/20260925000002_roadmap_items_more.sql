-- More roadmap items. Guarded by title so applying it more than once is safe.
-- (Public board content lives in roadmap_items now, not src/data/roadmap.ts.)

INSERT INTO roadmap_items (title, body, status, source, is_public, sort_order)
SELECT * FROM (VALUES
  -- Under review (considering)
  ('Public author pages', 'Considering making author pages public, so readers can find you and browse the notes you choose to share.', 'under_review', 'official', true, 5),
  -- In progress
  ('Admin tools', 'Behind-the-scenes tools to review suggestions and keep the roadmap tidy.', 'in_progress', 'official', true, 11),
  -- Planned
  ('Author pages', 'Your own profile on JustNoted — a home for who you are and the notes you share.', 'planned', 'official', true, 23)
) AS v(title, body, status, source, is_public, sort_order)
WHERE v.title NOT IN (SELECT title FROM roadmap_items);
