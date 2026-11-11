-- Persist the Yjs (CRDT) document for collaborative notes (design surface 05).
--
-- Previously the shared editor re-seeded a fresh Y.Doc from the note's markdown
-- on every open. Two independently-seeded docs merge as *duplicate* insertions
-- (the whole note appears twice), and a stale tab could overwrite newer edits.
--
-- Storing the Yjs state itself makes it the single source of truth: every
-- client loads the SAME document and merges deltas. Markdown (notes.content)
-- stays as a mirror for previews, the notes list, and non-collaborative views.

CREATE TABLE IF NOT EXISTS note_ydoc (
  note_id UUID PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
  state TEXT NOT NULL,               -- base64 of Y.encodeStateAsUpdate(doc)
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Read/written only through service-role server actions (collabActions), which
-- do their own access checks — so lock the table to everyone else.
ALTER TABLE note_ydoc ENABLE ROW LEVEL SECURITY;
