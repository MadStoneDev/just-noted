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
  -- Rich word lists (28 x 28 x 10000 ≈ 7.8M combinations) so random names read
  -- well and rarely collide. Matches the CamelCase style of existing accounts.
  adjectives TEXT[] := ARRAY[
    'Joyful','Bold','Brilliant','Whimsical','Legendary','Curious','Radiant','Serene',
    'Clever','Epic','Noble','Poetic','Magical','Vibrant','Peaceful','Gentle',
    'Mysterious','Graceful','Energetic','Fearless','Ancient','Cosmic','Enchanted',
    'Majestic','Thoughtful','Inspired','Passionate','Adventurous'];
  nouns TEXT[] := ARRAY[
    'Manuscript','Chronicle','Chronicler','Scroll','Parchment','Journal','Novel','Poet',
    'Author','Scribe','Storyteller','Bard','Muse','Page','Quill','Penman','Novelist',
    'Writer','Diary','Haven','Library','Tale','Text','Soul','Voice','Garden','Mind','Heart'];
BEGIN
  RETURN adjectives[floor(random() * array_length(adjectives, 1) + 1)::int]
    || nouns[floor(random() * array_length(nouns, 1) + 1)::int]
    || lpad(floor(random() * 10000)::int::text, 4, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.create_author_with_random_username(user_id UUID)
RETURNS JSON AS $$
DECLARE
  new_username TEXT;
  result JSON;
  attempts INT := 0;
BEGIN
  -- Already has an author (e.g. trigger fired twice / retry) → return it.
  SELECT json_build_object('id', id, 'username', username) INTO result
  FROM public.authors WHERE id = user_id;
  IF result IS NOT NULL THEN
    RETURN result;
  END IF;

  -- Retry on a username collision so a random clash can never break signup.
  -- (ON CONFLICT (id) alone did NOT cover the username UNIQUE constraint.)
  LOOP
    attempts := attempts + 1;
    new_username := public.generate_random_username();
    BEGIN
      INSERT INTO public.authors (id, username) VALUES (user_id, new_username);
      EXIT; -- success
    EXCEPTION
      WHEN unique_violation THEN
        -- If the id already got an author (concurrent insert), we're done.
        IF EXISTS (SELECT 1 FROM public.authors WHERE id = user_id) THEN
          EXIT;
        END IF;
        -- After a few username clashes, guarantee uniqueness with the full
        -- user id (globally unique) so this INSERT can't hit the username
        -- constraint and re-raise from inside the handler.
        IF attempts >= 10 THEN
          INSERT INTO public.authors (id, username)
          VALUES (user_id, new_username || '-' || user_id::text)
          ON CONFLICT (id) DO NOTHING;
          EXIT;
        END IF;
        -- otherwise loop and try a fresh username
    END;
  END LOOP;

  SELECT json_build_object('id', id, 'username', username) INTO result
  FROM public.authors WHERE id = user_id;
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

-- NOTE: authors is NOT publicly readable. Cross-user author display (e.g. the
-- author of a shared note) is served by the service-role client, which bypasses
-- RLS. A `USING (true)` SELECT policy here would let the anon key enumerate every
-- user, so it has been intentionally removed. Own-row read is covered above by
-- "Users can read own author".
DROP POLICY IF EXISTS "Anyone can read author public info" ON public.authors;

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

-- Readers list is NOT world-readable. Reads go through the service-role client;
-- regular-client reads are scoped to the share owner or the reader themselves.
DROP POLICY IF EXISTS "Readers can read own access" ON public.shared_notes_readers;

DROP POLICY IF EXISTS "Note owners can view readers" ON public.shared_notes_readers;
CREATE POLICY "Note owners can view readers" ON public.shared_notes_readers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.shared_notes s
      WHERE s.id = shared_notes_readers.shared_note
        AND s.note_owner_id = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "Readers can view own access" ON public.shared_notes_readers;
CREATE POLICY "Readers can view own access" ON public.shared_notes_readers
  FOR SELECT USING (
    reader_username = (SELECT username FROM public.authors WHERE id = auth.uid())
  );

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

-- Idempotent: only add tables that aren't already members of the publication
-- (re-running ADD TABLE on an existing member raises 42710 duplicate_object).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notes;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notebooks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notebooks;
  END IF;
END $$;

-- ============================================
-- DONE! Now export data from Cloud and import here.
-- ============================================
