-- Saved shared notes: lets a user bookmark a shared note they received a LINK
-- to (as opposed to shared_notes_readers, where the OWNER grants access).
-- These show under "Shared with you" alongside owner-granted shares.

CREATE TABLE IF NOT EXISTS public.saved_shared_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  shortcode TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, shortcode)
);

CREATE INDEX IF NOT EXISTS saved_shared_notes_user_idx
  ON public.saved_shared_notes (user_id);

ALTER TABLE public.saved_shared_notes ENABLE ROW LEVEL SECURITY;

-- A user manages only their own saved rows.
DROP POLICY IF EXISTS "Users manage own saved shares" ON public.saved_shared_notes;
CREATE POLICY "Users manage own saved shares" ON public.saved_shared_notes
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access saved shares" ON public.saved_shared_notes;
CREATE POLICY "Service role full access saved shares" ON public.saved_shared_notes
  FOR ALL USING (auth.role() = 'service_role');
