-- Per-person roles + email invites for the share sheet (design surface 04).

-- 1) A reader can be granted "view" or "edit" on a specific shared note.
--    Edit is enforced server-side alongside the link-level permission.
ALTER TABLE shared_notes_readers
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'view';

ALTER TABLE shared_notes_readers DROP CONSTRAINT IF EXISTS shared_notes_readers_role_check;
ALTER TABLE shared_notes_readers
  ADD CONSTRAINT shared_notes_readers_role_check CHECK (role IN ('view', 'edit'));

-- 2) Resolve an author id from an email address so people can be added by email,
--    not only username. auth.users isn't exposed to PostgREST, so this runs as a
--    SECURITY DEFINER function; it's called from the server with the service role.
CREATE OR REPLACE FUNCTION public.author_id_by_email(p_email text)
  RETURNS uuid
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(trim(p_email)) LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.author_id_by_email(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.author_id_by_email(text) TO service_role;
