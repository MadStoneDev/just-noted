-- READ-ONLY. Lists "(conflicted copy — …)" notes whose body is identical to a
-- sibling note (same author, same base title) once line endings and trailing
-- whitespace are normalised — i.e. spurious copies that never actually diverged.
--
-- It does NOT delete anything. Review the result, then delete the copy_id rows
-- you're happy to remove, e.g.:
--   DELETE FROM public.notes WHERE id IN ('<copy_id>', '<copy_id>', …);
--
-- Normalisation mirrors sameNoteContent() in src/utils/notes-utils.ts
-- (CRLF -> LF, strip trailing whitespace). Conservative: it only matches when
-- the bodies are truly the same, so a real conflicted copy is never listed.

WITH copies AS (
  SELECT
    id,
    author,
    title,
    version,
    created_at,
    regexp_replace(title, '\s*\(conflicted copy — .*\)\s*$', '')              AS base_title,
    regexp_replace(replace(coalesce(content, ''), E'\r\n', E'\n'), '\s+$', '') AS norm
  FROM public.notes
  WHERE title ~ '\(conflicted copy — '
    AND deleted_at IS NULL
),
originals AS (
  SELECT
    id,
    author,
    title,
    regexp_replace(replace(coalesce(content, ''), E'\r\n', E'\n'), '\s+$', '') AS norm
  FROM public.notes
  WHERE title !~ '\(conflicted copy — '
    AND deleted_at IS NULL
)
SELECT
  c.id        AS copy_id,
  c.title     AS copy_title,
  c.version   AS copy_version,
  c.created_at,
  o.id        AS original_id,
  o.title     AS original_title
FROM copies c
JOIN originals o
  ON o.author = c.author
 AND o.title  = c.base_title
 AND o.norm   = c.norm
ORDER BY c.created_at DESC;
