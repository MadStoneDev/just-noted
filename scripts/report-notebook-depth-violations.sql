-- READ-ONLY. Lists notebooks that violate max depth 2 (spec 03-notebooks.md §1):
-- a section nested under another section (i.e. a notebook whose parent itself has
-- a parent). The current API rejects new violations, but data created before that
-- enforcement could still exist.
--
-- Fix per row (review first — do not auto-run):
--   -- promote the grandchild to top-level:
--   UPDATE public.notebooks SET parent_id = NULL WHERE id = '<child_id>';
--   -- or reparent it onto its grandparent (its parent's parent):
--   UPDATE public.notebooks SET parent_id = '<grandparent_id>' WHERE id = '<child_id>';

SELECT
  c.id        AS child_id,
  c.name      AS child_name,
  p.id        AS parent_id,
  p.name      AS parent_name,
  g.id        AS grandparent_id,
  g.name      AS grandparent_name,
  c.owner
FROM public.notebooks c
JOIN public.notebooks p ON p.id = c.parent_id
JOIN public.notebooks g ON g.id = p.parent_id
ORDER BY c.owner, g.name, p.name, c.name;
