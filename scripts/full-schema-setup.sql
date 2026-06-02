-- ============================================
-- JustNoted: Full Schema Setup for Fresh Supabase
-- Run this ONCE on your Coolify Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS public.authors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at TIMESTAMPTZ,
  redis_user_id TEXT
);

CREATE TABLE IF NOT EXISTS public.notebooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner UUID NOT NULL,
  name TEXT NOT NULL,
  cover_type TEXT NOT NULL DEFAULT 'color',
  cover_value TEXT NOT NULL DEFAULT '#6366f1',
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author UUID,
  title TEXT,
  content TEXT,
  is_pinned BOOLEAN DEFAULT false,
  is_private BOOLEAN DEFAULT false,
  is_collapsed BOOLEAN DEFAULT false,
  "order" INTEGER DEFAULT 0,
  goal INTEGER,
  goal_type TEXT,
  notebook_id UUID REFERENCES public.notebooks(id) ON DELETE SET NULL,
  content_format TEXT DEFAULT 'html',
  content_html_backup TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner UUID REFERENCES public.authors(id),
  name TEXT,
  shortcode TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.collections_notes (
  id SERIAL PRIMARY KEY,
  collection_id UUID NOT NULL DEFAULT gen_random_uuid() REFERENCES public.collections(id),
  note_id UUID REFERENCES public.notes(id)
);

CREATE TABLE IF NOT EXISTS public.shared_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL,
  note_owner_id TEXT NOT NULL,
  note_owner_id_old TEXT,
  shortcode TEXT NOT NULL UNIQUE,
  is_public BOOLEAN DEFAULT true,
  is_anonymous BOOLEAN DEFAULT false,
  password_hash TEXT,
  storage TEXT DEFAULT 'supabase',
  view_count INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shared_notes_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_note UUID NOT NULL REFERENCES public.shared_notes(id),
  analytics JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shared_notes_readers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_note UUID NOT NULL REFERENCES public.shared_notes(id),
  reader_username TEXT NOT NULL,
  reader_id TEXT,
  view_count INTEGER,
  first_viewed_at TIMESTAMPTZ,
  last_viewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tier TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  paddle_subscription_id TEXT,
  paddle_customer_id TEXT,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notes_author ON public.notes(author);
CREATE INDEX IF NOT EXISTS idx_notes_notebook_id ON public.notes(notebook_id);
CREATE INDEX IF NOT EXISTS idx_notes_content_format ON public.notes(content_format);
CREATE INDEX IF NOT EXISTS idx_notebooks_owner ON public.notebooks(owner);
CREATE INDEX IF NOT EXISTS idx_shared_notes_shortcode ON public.shared_notes(shortcode);
CREATE INDEX IF NOT EXISTS idx_shared_notes_note_id ON public.shared_notes(note_id);

-- ============================================
-- 2. FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION public.generate_random_username()
RETURNS TEXT AS $$
DECLARE
  adjectives TEXT[] := ARRAY['swift','bright','calm','bold','keen','warm','cool','wise','free','glad'];
  nouns TEXT[] := ARRAY['fox','owl','elk','jay','bee','ant','cat','dog','bat','ram'];
  result TEXT;
BEGIN
  result := adjectives[floor(random() * array_length(adjectives, 1) + 1)::int]
    || nouns[floor(random() * array_length(nouns, 1) + 1)::int]
    || floor(random() * 9000 + 1000)::text;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.create_author_with_random_username(user_id UUID)
RETURNS JSON AS $$
DECLARE
  new_username TEXT;
  result JSON;
BEGIN
  new_username := public.generate_random_username();

  INSERT INTO public.authors (id, username)
  VALUES (user_id, new_username)
  ON CONFLICT (id) DO NOTHING;

  SELECT json_build_object('id', id, 'username', username)
  INTO result
  FROM public.authors
  WHERE id = user_id;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.increment_view_count(shortcode_param TEXT)
RETURNS INTEGER AS $$
DECLARE
  new_count INTEGER;
BEGIN
  UPDATE public.shared_notes
  SET view_count = COALESCE(view_count, 0) + 1
  WHERE shortcode = shortcode_param
  RETURNING view_count INTO new_count;

  RETURN COALESCE(new_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. AUTO-CREATE AUTHOR ON SIGNUP (trigger)
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.create_author_with_random_username(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 4. RLS POLICIES
-- ============================================

ALTER TABLE public.authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notebooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_notes_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_notes_readers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Authors: users can read/update their own
DROP POLICY IF EXISTS "Users can read own author" ON public.authors;
CREATE POLICY "Users can read own author" ON public.authors
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own author" ON public.authors;
CREATE POLICY "Users can update own author" ON public.authors
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Service role full access authors" ON public.authors;
CREATE POLICY "Service role full access authors" ON public.authors
  FOR ALL USING (auth.role() = 'service_role');

-- Allow reading any author's public info (for shared notes)
DROP POLICY IF EXISTS "Anyone can read author public info" ON public.authors;
CREATE POLICY "Anyone can read author public info" ON public.authors
  FOR SELECT USING (true);

-- Notes: users can CRUD their own
DROP POLICY IF EXISTS "Users can read own notes" ON public.notes;
CREATE POLICY "Users can read own notes" ON public.notes
  FOR SELECT USING (auth.uid()::text = author::text);

DROP POLICY IF EXISTS "Users can insert own notes" ON public.notes;
CREATE POLICY "Users can insert own notes" ON public.notes
  FOR INSERT WITH CHECK (auth.uid()::text = author::text);

DROP POLICY IF EXISTS "Users can update own notes" ON public.notes;
CREATE POLICY "Users can update own notes" ON public.notes
  FOR UPDATE USING (auth.uid()::text = author::text);

DROP POLICY IF EXISTS "Users can delete own notes" ON public.notes;
CREATE POLICY "Users can delete own notes" ON public.notes
  FOR DELETE USING (auth.uid()::text = author::text);

DROP POLICY IF EXISTS "Service role full access notes" ON public.notes;
CREATE POLICY "Service role full access notes" ON public.notes
  FOR ALL USING (auth.role() = 'service_role');

-- Notebooks: owner access
DROP POLICY IF EXISTS "Users can CRUD own notebooks" ON public.notebooks;
CREATE POLICY "Users can CRUD own notebooks" ON public.notebooks
  FOR ALL USING (auth.uid() = owner);

-- Shared notes: owner can CRUD, anyone can read public
DROP POLICY IF EXISTS "Owner can CRUD shared notes" ON public.shared_notes;
CREATE POLICY "Owner can CRUD shared notes" ON public.shared_notes
  FOR ALL USING (auth.uid()::text = note_owner_id);

DROP POLICY IF EXISTS "Anyone can read public shared notes" ON public.shared_notes;
CREATE POLICY "Anyone can read public shared notes" ON public.shared_notes
  FOR SELECT USING (is_public = true);

DROP POLICY IF EXISTS "Service role full access shared notes" ON public.shared_notes;
CREATE POLICY "Service role full access shared notes" ON public.shared_notes
  FOR ALL USING (auth.role() = 'service_role');

-- Shared notes readers
DROP POLICY IF EXISTS "Owner can manage readers" ON public.shared_notes_readers;
CREATE POLICY "Owner can manage readers" ON public.shared_notes_readers
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Readers can read own access" ON public.shared_notes_readers;
CREATE POLICY "Readers can read own access" ON public.shared_notes_readers
  FOR SELECT USING (true);

-- Subscriptions: service role only
DROP POLICY IF EXISTS "Service role full access subscriptions" ON public.subscriptions;
CREATE POLICY "Service role full access subscriptions" ON public.subscriptions
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can read own subscription" ON public.subscriptions;
CREATE POLICY "Users can read own subscription" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================
-- 5. STORAGE BUCKETS
-- ============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('notebook-covers', 'notebook-covers', true)
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage policies
DROP POLICY IF EXISTS "Users can upload covers" ON storage.objects;
CREATE POLICY "Users can upload covers" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'notebook-covers' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can update covers" ON storage.objects;
CREATE POLICY "Users can update covers" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'notebook-covers' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can delete covers" ON storage.objects;
CREATE POLICY "Users can delete covers" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'notebook-covers' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Public read covers" ON storage.objects;
CREATE POLICY "Public read covers" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'notebook-covers');

DROP POLICY IF EXISTS "Users can upload avatars" ON storage.objects;
CREATE POLICY "Users can upload avatars" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can update avatars" ON storage.objects;
CREATE POLICY "Users can update avatars" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can delete avatars" ON storage.objects;
CREATE POLICY "Users can delete avatars" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;
CREATE POLICY "Public read avatars" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'avatars');

-- ============================================
-- 6. REALTIME
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notebooks;

-- ============================================
-- DONE! Now export data from Cloud and import here.
-- ============================================
