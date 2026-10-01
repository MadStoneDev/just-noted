-- One-shot repair for the shared note "Paediatric Nurses Take on Routines and
-- Regulation" whose collaborative doc (note_ydoc) went blank while notes.content
-- still holds the full text (2140 words), leaving an empty editor body.
--
-- The fix is to clear the stale/blank note_ydoc row. On the next open, the
-- collab seeding path finds no persisted state and re-seeds the Yjs doc from
-- notes.content (see the seeder logic in src/components/editor/milkdown-editor.tsx).
--
-- SAFE BY CONSTRUCTION: step 1 proves notes.content still has text before you
-- touch anything, and step 2 only deletes the ydoc when that's true — it can
-- never blank the note.

-- STEP 1 — confirm the canonical text is still there (expect a non-zero length
-- and a preview of the real content). If length is 0, STOP and do not run step 2.
SELECT
  n.id,
  n.title,
  length(btrim(coalesce(n.content, ''))) AS content_len,
  left(n.content, 200)                   AS content_preview,
  (y.note_id IS NOT NULL)                AS has_ydoc_row
FROM public.notes n
LEFT JOIN public.note_ydoc y ON y.note_id = n.id
WHERE n.title = 'Paediatric Nurses Take on Routines and Regulation'
  AND n.deleted_at IS NULL;

-- STEP 2 — clear the blank collaborative doc so it re-seeds from notes.content.
-- Guarded: deletes only while notes.content is non-empty. Re-run STEP 1 after to
-- confirm has_ydoc_row is now false; then reopen the note to re-seed.
DELETE FROM public.note_ydoc y
USING public.notes n
WHERE y.note_id = n.id
  AND n.title = 'Paediatric Nurses Take on Routines and Regulation'
  AND n.deleted_at IS NULL
  AND length(btrim(coalesce(n.content, ''))) > 0;
