-- Reconcile a from-scratch replay with production.
--
-- 20260101000000_production_baseline.sql is production's real `public` schema.
-- The older migrations that re-run on top of it recreate objects production no
-- longer has (mostly 20260205_rls_policies_revised and the notebook policies in
-- 20260330_realtime_and_notebooks_rls — production replaced them with the
-- differently named policies in the baseline). This drops them again so a fresh
-- `supabase db reset` ends at exactly production's policies and grants.
--
-- Against production itself every statement is a no-op (the policies don't exist
-- there and anon already lacks UPDATE on notifications).

-- authors
DROP POLICY IF EXISTS "Service role can manage all author records" ON public.authors;

-- notes
DROP POLICY IF EXISTS "Users can insert their own notes" ON public.notes;

-- notebooks (production has the single "Users can CRUD own notebooks")
DROP POLICY IF EXISTS "Users can view own notebooks" ON public.notebooks;
DROP POLICY IF EXISTS "Users can create own notebooks" ON public.notebooks;
DROP POLICY IF EXISTS "Users can update own notebooks" ON public.notebooks;
DROP POLICY IF EXISTS "Users can delete own notebooks" ON public.notebooks;
DROP POLICY IF EXISTS "Service role full access to notebooks" ON public.notebooks;

-- shared_notes (production has the "Owner can …" / "Anyone can read public …" set)
DROP POLICY IF EXISTS shared_notes_select_owner ON public.shared_notes;
DROP POLICY IF EXISTS shared_notes_select_public ON public.shared_notes;
DROP POLICY IF EXISTS shared_notes_insert_owner ON public.shared_notes;
DROP POLICY IF EXISTS shared_notes_update_owner ON public.shared_notes;
DROP POLICY IF EXISTS shared_notes_delete_owner ON public.shared_notes;
DROP POLICY IF EXISTS "Service role full access to shared_notes" ON public.shared_notes;

-- shared_notes_readers (production: owners/readers can SELECT only; writes are
-- service-role)
DROP POLICY IF EXISTS "Note owners can insert readers" ON public.shared_notes_readers;
DROP POLICY IF EXISTS "Note owners can update readers" ON public.shared_notes_readers;
DROP POLICY IF EXISTS "Note owners can delete readers" ON public.shared_notes_readers;
DROP POLICY IF EXISTS "Public notes can track readers" ON public.shared_notes_readers;
DROP POLICY IF EXISTS "Service role full access to shared_notes_readers" ON public.shared_notes_readers;

-- shared_notes_analytics (production: no policies, service-role only)
DROP POLICY IF EXISTS "Note owners can view analytics" ON public.shared_notes_analytics;
DROP POLICY IF EXISTS "Note owners can insert analytics" ON public.shared_notes_analytics;
DROP POLICY IF EXISTS "Public notes can track analytics" ON public.shared_notes_analytics;
DROP POLICY IF EXISTS "Service role full access to shared_notes_analytics" ON public.shared_notes_analytics;

-- collections / collections_notes (production: no policies)
DROP POLICY IF EXISTS "Users can view own collections" ON public.collections;
DROP POLICY IF EXISTS "Users can create own collections" ON public.collections;
DROP POLICY IF EXISTS "Users can update own collections" ON public.collections;
DROP POLICY IF EXISTS "Users can delete own collections" ON public.collections;
DROP POLICY IF EXISTS "Users can view own collection notes" ON public.collections_notes;
DROP POLICY IF EXISTS "Users can add notes to own collections" ON public.collections_notes;
DROP POLICY IF EXISTS "Users can remove notes from own collections" ON public.collections_notes;

-- subscriptions (production has "Users can read own subscription")
DROP POLICY IF EXISTS "Users can view own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Service role full access to subscriptions" ON public.subscriptions;

-- Grants: production's anon role has no UPDATE on notifications (only
-- authenticated, and only on read_at). Locally the table gets ALL from Supabase's
-- default privileges when the baseline creates it.
REVOKE UPDATE ON public.notifications FROM anon;

-- author_id_by_email: restore production's exact definition (20260923 rewrote
-- the same body with different whitespace).
CREATE OR REPLACE FUNCTION public.author_id_by_email(p_email text) RETURNS uuid
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$ SELECT id FROM auth.users WHERE lower(email) = lower(trim(p_email)) LIMIT 1; $$;
