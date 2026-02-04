-- Row-Level Security Policies for Just Noted (Revised)
-- Migration: 20260205_rls_policies_revised.sql
--
-- This migration fixes security issues identified in the existing RLS setup.
--
-- IMPORTANT: Column type handling
-- - UUID columns: compare directly with auth.uid()
-- - TEXT columns: compare with auth.uid()::text
--
-- Run this in the Supabase SQL Editor

-- ============================================================
-- STEP 1: Remove dangerous/duplicate policies
-- ============================================================

-- Remove overly permissive author insert policies (allow anyone to insert)
DROP POLICY IF EXISTS "Allow insert for new user profiles" ON authors;
DROP POLICY IF EXISTS "Allow trigger to insert authors" ON authors;

-- Remove duplicate notes policies (keep the properly named ones)
DROP POLICY IF EXISTS "Notes are deletable by owner" ON notes;
DROP POLICY IF EXISTS "Notes are editable by owner" ON notes;
DROP POLICY IF EXISTS "Notes are insertable by owner" ON notes;
DROP POLICY IF EXISTS "Notes are viewable by owner" ON notes;

-- Remove the overly permissive notes insert policy
DROP POLICY IF EXISTS "Users can create their own notes" ON notes;

-- ============================================================
-- STEP 2: Fix authors table - add service role policy if needed
-- ============================================================

-- Service role needs full access for triggers/functions
DROP POLICY IF EXISTS "Service role can manage all author records" ON authors;
CREATE POLICY "Service role can manage all author records" ON authors
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- STEP 3: Fix notes table - ensure proper insert policy
-- ============================================================

-- Recreate insert policy with proper check
-- notes.author is UUID type (based on existing working policies)
DROP POLICY IF EXISTS "Users can insert their own notes" ON notes;
CREATE POLICY "Users can insert their own notes" ON notes
  FOR INSERT
  WITH CHECK (auth.uid() = author);

-- ============================================================
-- STEP 4: Enable RLS on shared_notes and add policies
-- ============================================================

ALTER TABLE shared_notes ENABLE ROW LEVEL SECURITY;

-- shared_notes.note_owner_id is TEXT type
-- Note owners can view their own shared note settings
DROP POLICY IF EXISTS "shared_notes_select_owner" ON shared_notes;
CREATE POLICY "shared_notes_select_owner" ON shared_notes
  FOR SELECT
  USING (auth.uid()::text = note_owner_id);

-- Anyone can view public shared notes (needed for public sharing feature)
DROP POLICY IF EXISTS "shared_notes_select_public" ON shared_notes;
CREATE POLICY "shared_notes_select_public" ON shared_notes
  FOR SELECT
  USING (is_public = true);

-- Note owners can insert shared note settings
DROP POLICY IF EXISTS "shared_notes_insert_owner" ON shared_notes;
CREATE POLICY "shared_notes_insert_owner" ON shared_notes
  FOR INSERT
  WITH CHECK (auth.uid()::text = note_owner_id);

-- Note owners can update their shared note settings
DROP POLICY IF EXISTS "shared_notes_update_owner" ON shared_notes;
CREATE POLICY "shared_notes_update_owner" ON shared_notes
  FOR UPDATE
  USING (auth.uid()::text = note_owner_id);

-- Note owners can delete their shared note settings
DROP POLICY IF EXISTS "shared_notes_delete_owner" ON shared_notes;
CREATE POLICY "shared_notes_delete_owner" ON shared_notes
  FOR DELETE
  USING (auth.uid()::text = note_owner_id);

-- Service role needs access for background operations
DROP POLICY IF EXISTS "Service role full access to shared_notes" ON shared_notes;
CREATE POLICY "Service role full access to shared_notes" ON shared_notes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- STEP 5: Enable RLS on shared_notes_readers and fix policies
-- ============================================================

ALTER TABLE shared_notes_readers ENABLE ROW LEVEL SECURITY;

-- Drop old policies that use note_owner_id_old
DROP POLICY IF EXISTS "Note owners can delete readers" ON shared_notes_readers;
DROP POLICY IF EXISTS "Note owners can insert readers" ON shared_notes_readers;
DROP POLICY IF EXISTS "Note owners can select readers of their notes" ON shared_notes_readers;
DROP POLICY IF EXISTS "Readers can see their own access to a note" ON shared_notes_readers;

-- Recreate with correct column reference (note_owner_id is TEXT)
CREATE POLICY "Note owners can view readers" ON shared_notes_readers
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM shared_notes
      WHERE shared_notes.id = shared_notes_readers.shared_note
      AND shared_notes.note_owner_id = auth.uid()::text
    )
  );

CREATE POLICY "Note owners can insert readers" ON shared_notes_readers
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM shared_notes
      WHERE shared_notes.id = shared_note
      AND shared_notes.note_owner_id = auth.uid()::text
    )
  );

CREATE POLICY "Note owners can update readers" ON shared_notes_readers
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM shared_notes
      WHERE shared_notes.id = shared_notes_readers.shared_note
      AND shared_notes.note_owner_id = auth.uid()::text
    )
  );

CREATE POLICY "Note owners can delete readers" ON shared_notes_readers
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM shared_notes
      WHERE shared_notes.id = shared_notes_readers.shared_note
      AND shared_notes.note_owner_id = auth.uid()::text
    )
  );

-- Readers can see their own access records (reader_id is TEXT)
CREATE POLICY "Readers can view own access" ON shared_notes_readers
  FOR SELECT
  USING (
    reader_id = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM authors
      WHERE authors.id = auth.uid()
      AND authors.username = shared_notes_readers.reader_username
    )
  );

-- Allow inserting reader records for public shared notes (view tracking)
CREATE POLICY "Public notes can track readers" ON shared_notes_readers
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM shared_notes
      WHERE shared_notes.id = shared_note
      AND shared_notes.is_public = true
    )
  );

-- Service role access
DROP POLICY IF EXISTS "Service role full access to shared_notes_readers" ON shared_notes_readers;
CREATE POLICY "Service role full access to shared_notes_readers" ON shared_notes_readers
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- STEP 6: Fix shared_notes_analytics policies (use note_owner_id)
-- ============================================================

-- Drop old policies that use note_owner_id_old
DROP POLICY IF EXISTS "Note owners can insert analytics" ON shared_notes_analytics;
DROP POLICY IF EXISTS "Note owners can view analytics of their notes" ON shared_notes_analytics;

-- Recreate with correct column (note_owner_id is TEXT)
CREATE POLICY "Note owners can view analytics" ON shared_notes_analytics
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM shared_notes
      WHERE shared_notes.id = shared_notes_analytics.shared_note
      AND shared_notes.note_owner_id = auth.uid()::text
    )
  );

CREATE POLICY "Note owners can insert analytics" ON shared_notes_analytics
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM shared_notes
      WHERE shared_notes.id = shared_note
      AND shared_notes.note_owner_id = auth.uid()::text
    )
  );

-- Allow analytics insertion for public notes (view tracking)
CREATE POLICY "Public notes can track analytics" ON shared_notes_analytics
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM shared_notes
      WHERE shared_notes.id = shared_note
      AND shared_notes.is_public = true
    )
  );

-- Service role access
DROP POLICY IF EXISTS "Service role full access to shared_notes_analytics" ON shared_notes_analytics;
CREATE POLICY "Service role full access to shared_notes_analytics" ON shared_notes_analytics
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- STEP 7: Add missing policies for collections
-- ============================================================

-- collections.owner is UUID type (foreign key to authors.id)
DROP POLICY IF EXISTS "Users can view own collections" ON collections;
CREATE POLICY "Users can view own collections" ON collections
  FOR SELECT
  USING (auth.uid() = owner);

DROP POLICY IF EXISTS "Users can create own collections" ON collections;
CREATE POLICY "Users can create own collections" ON collections
  FOR INSERT
  WITH CHECK (auth.uid() = owner);

DROP POLICY IF EXISTS "Users can update own collections" ON collections;
CREATE POLICY "Users can update own collections" ON collections
  FOR UPDATE
  USING (auth.uid() = owner);

DROP POLICY IF EXISTS "Users can delete own collections" ON collections;
CREATE POLICY "Users can delete own collections" ON collections
  FOR DELETE
  USING (auth.uid() = owner);

-- ============================================================
-- STEP 8: Add missing policies for collections_notes
-- ============================================================

-- collections_notes references collections, which uses UUID owner
DROP POLICY IF EXISTS "Users can view own collection notes" ON collections_notes;
CREATE POLICY "Users can view own collection notes" ON collections_notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM collections
      WHERE collections.id = collections_notes.collection_id
      AND collections.owner = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can add notes to own collections" ON collections_notes;
CREATE POLICY "Users can add notes to own collections" ON collections_notes
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM collections
      WHERE collections.id = collection_id
      AND collections.owner = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can remove notes from own collections" ON collections_notes;
CREATE POLICY "Users can remove notes from own collections" ON collections_notes
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM collections
      WHERE collections.id = collections_notes.collection_id
      AND collections.owner = auth.uid()
    )
  );

-- ============================================================
-- STEP 9: Create subscriptions table and policies (if not exists)
-- ============================================================

-- Create subscriptions table if it doesn't exist
-- user_id is TEXT to store UUID as string (matches app code pattern)
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,
  tier TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  paddle_subscription_id TEXT,
  paddle_customer_id TEXT,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only view their own subscription (user_id is TEXT)
DROP POLICY IF EXISTS "Users can view own subscription" ON subscriptions;
CREATE POLICY "Users can view own subscription" ON subscriptions
  FOR SELECT
  USING (auth.uid()::text = user_id);

-- Only service role can insert/update/delete (via webhooks)
DROP POLICY IF EXISTS "Service role full access to subscriptions" ON subscriptions;
CREATE POLICY "Service role full access to subscriptions" ON subscriptions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- VERIFICATION: Run after migration to confirm
-- ============================================================
--
-- Check RLS status:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'
-- AND tablename IN ('authors', 'notes', 'notebooks', 'collections', 'collections_notes',
--                   'shared_notes', 'shared_notes_readers', 'shared_notes_analytics', 'subscriptions');
--
-- Check policies:
-- SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename;
