-- Per-recipient organization of shared notes (recipient sidebar revamp).
--
-- Lets a RECIPIENT pin, reorder, hide and tag the notes shared with (or saved
-- by) them, entirely in their own view — this never affects the owner or any
-- other recipient. Granted notes (an owner added you as a reader) keep this on
-- the reader's own shared_notes_readers row; saved-by-link notes keep it on the
-- recipient's saved_shared_notes row (saved notes are removed, never hidden).
-- Per-recipient tags reuse the existing per-user `tags` vocabulary via a new
-- join keyed by the share's shortcode — the one handle common to both granted
-- and saved notes (saved notes have no shared_notes_readers row).
--
-- Idempotent: safe to run repeatedly. Back up before running.

-- 1. Granted-note per-recipient state (one row per reader).
ALTER TABLE public.shared_notes_readers
  ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;

-- 2. Saved-by-link per-recipient state.
ALTER TABLE public.saved_shared_notes
  ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- 3. Per-recipient tags for shared notes. Reuses the existing `tags` table as
--    the vocabulary; keyed by shortcode so it covers both granted and saved
--    notes. created_at supports stable ordering if ever needed.
CREATE TABLE IF NOT EXISTS public.shared_note_tags (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shortcode TEXT NOT NULL,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, shortcode, tag_id)
);

CREATE INDEX IF NOT EXISTS shared_note_tags_user_shortcode_idx
  ON public.shared_note_tags (user_id, shortcode);

ALTER TABLE public.shared_note_tags ENABLE ROW LEVEL SECURITY;

-- A recipient manages only their own shared-note tags.
DROP POLICY IF EXISTS "Users manage own shared-note tags" ON public.shared_note_tags;
CREATE POLICY "Users manage own shared-note tags" ON public.shared_note_tags
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access to shared_note_tags" ON public.shared_note_tags;
CREATE POLICY "Service role full access to shared_note_tags" ON public.shared_note_tags
  FOR ALL TO service_role USING (true) WITH CHECK (true);
