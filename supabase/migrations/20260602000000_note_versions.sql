CREATE TABLE IF NOT EXISTS public.note_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL,
  author UUID NOT NULL,
  title TEXT,
  content TEXT,
  content_format TEXT DEFAULT 'markdown',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_note_versions_note_id ON public.note_versions(note_id);
CREATE INDEX IF NOT EXISTS idx_note_versions_created ON public.note_versions(created_at DESC);

ALTER TABLE public.note_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own versions" ON public.note_versions;
CREATE POLICY "Users can read own versions" ON public.note_versions
  FOR SELECT USING (auth.uid() = author);

DROP POLICY IF EXISTS "Users can insert own versions" ON public.note_versions;
CREATE POLICY "Users can insert own versions" ON public.note_versions
  FOR INSERT WITH CHECK (auth.uid() = author);

DROP POLICY IF EXISTS "Users can delete own versions" ON public.note_versions;
CREATE POLICY "Users can delete own versions" ON public.note_versions
  FOR DELETE USING (auth.uid() = author);
