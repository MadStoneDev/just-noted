-- Tighten RLS on authors and shared_notes_readers.
--
-- Problem: full-schema-setup.sql created permissive `USING (true)` SELECT
-- policies on both tables:
--   * authors "Anyone can read author public info" — lets the public anon key
--     dump every user's id / username / avatar (full user enumeration).
--   * shared_notes_readers "Readers can read own access" — lets any authenticated
--     user read the entire reader list of every share.
--
-- These are unnecessary. All cross-user author display (e.g. the author shown on
-- a shared-note page) is served by the SERVICE-ROLE client, which bypasses RLS.
-- Every regular-client read of `authors` in the app is for the caller's OWN row
-- (`.eq("id", auth.uid())`), already covered by "Users can read own author".
-- All reads of `shared_notes_readers` go through the service-role client, and the
-- owner/reader-scoped policies from 20260205_rls_policies_revised.sql already
-- cover legitimate regular-client access.
--
-- This migration removes the permissive policies so those scoped policies are the
-- only ones in effect. Safe to run repeatedly.

-- 1. authors: remove the public "read everyone" policy.
DROP POLICY IF EXISTS "Anyone can read author public info" ON public.authors;

-- Make sure a user can still always read their own author row.
DROP POLICY IF EXISTS "Users can read own author" ON public.authors;
CREATE POLICY "Users can read own author" ON public.authors
  FOR SELECT USING (auth.uid() = id);

-- 2. shared_notes_readers: remove the permissive `USING (true)` SELECT policy.
DROP POLICY IF EXISTS "Readers can read own access" ON public.shared_notes_readers;

-- Ensure owner- and reader-scoped SELECT policies exist (mirrors 20260205).
-- note_owner_id is TEXT, so compare against auth.uid()::text.
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
