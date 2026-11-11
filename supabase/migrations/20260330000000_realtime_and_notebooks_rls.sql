-- Migration: 20260330_realtime_and_notebooks_rls.sql
--
-- 1. Enable Realtime publication for the notes table (required for cross-device sync)
-- 2. Add missing RLS policies for notebooks table
--
-- Run this on your self-hosted Supabase instance via SQL Editor or psql.

-- ============================================================
-- STEP 1: Enable Realtime for notes table
-- ============================================================

-- Add notes table to the supabase_realtime publication so that
-- postgres_changes events are broadcast to subscribed clients.
ALTER PUBLICATION supabase_realtime ADD TABLE notes;

-- ============================================================
-- STEP 2: Enable RLS on notebooks and add policies
-- ============================================================

ALTER TABLE notebooks ENABLE ROW LEVEL SECURITY;

-- notebooks.owner is UUID type (matches authors.id)
DROP POLICY IF EXISTS "Users can view own notebooks" ON notebooks;
CREATE POLICY "Users can view own notebooks" ON notebooks
  FOR SELECT
  USING (auth.uid() = owner);

DROP POLICY IF EXISTS "Users can create own notebooks" ON notebooks;
CREATE POLICY "Users can create own notebooks" ON notebooks
  FOR INSERT
  WITH CHECK (auth.uid() = owner);

DROP POLICY IF EXISTS "Users can update own notebooks" ON notebooks;
CREATE POLICY "Users can update own notebooks" ON notebooks
  FOR UPDATE
  USING (auth.uid() = owner);

DROP POLICY IF EXISTS "Users can delete own notebooks" ON notebooks;
CREATE POLICY "Users can delete own notebooks" ON notebooks
  FOR DELETE
  USING (auth.uid() = owner);

-- Service role needs full access for admin/background operations
DROP POLICY IF EXISTS "Service role full access to notebooks" ON notebooks;
CREATE POLICY "Service role full access to notebooks" ON notebooks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- VERIFICATION: Run after migration to confirm
-- ============================================================
--
-- Check Realtime publication:
-- SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
--
-- Check notebooks RLS:
-- SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public' AND tablename = 'notebooks';
--
-- Check notebooks policies:
-- SELECT policyname, cmd FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'notebooks';
