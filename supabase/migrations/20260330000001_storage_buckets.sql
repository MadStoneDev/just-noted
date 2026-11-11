-- Migration: 20260330_storage_buckets.sql
--
-- Creates storage buckets and RLS policies for the self-hosted Supabase instance.
-- Both buckets are public (the app uses getPublicUrl for serving images).

-- ============================================================
-- STEP 1: Create storage buckets
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('notebook-covers', 'notebook-covers', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- STEP 2: Storage RLS policies for notebook-covers
-- ============================================================

-- Users can upload covers in their own folder (folder name = user UUID)
DROP POLICY IF EXISTS "Users can upload covers" ON storage.objects;
CREATE POLICY "Users can upload covers" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'notebook-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can update covers" ON storage.objects;
CREATE POLICY "Users can update covers" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'notebook-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can delete covers" ON storage.objects;
CREATE POLICY "Users can delete covers" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'notebook-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Public read covers" ON storage.objects;
CREATE POLICY "Public read covers" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'notebook-covers');

-- ============================================================
-- STEP 3: Storage RLS policies for avatars
-- ============================================================

DROP POLICY IF EXISTS "Users can upload avatars" ON storage.objects;
CREATE POLICY "Users can upload avatars" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can update avatars" ON storage.objects;
CREATE POLICY "Users can update avatars" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can delete avatars" ON storage.objects;
CREATE POLICY "Users can delete avatars" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;
CREATE POLICY "Public read avatars" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'avatars');
