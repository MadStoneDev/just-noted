-- Harden the author/username functions and repair broken usernames.
--
-- 1. author_id_by_email(text) — resolves an email to a user id (auth.users).
--    Production let every signed-in user call it (account enumeration); the
--    only caller is the share-by-email server action, which uses the service
--    role (src/app/actions/sharing.ts). Service role only.
--
-- 2. create_author_with_random_username(uuid) — SECURITY DEFINER with no fixed
--    search_path, executable by anon: anyone could create an author row for any
--    user id, or read any user's username by id. Callers: the signup trigger
--    (handle_new_user, which runs as the function owner and keeps working) and
--    the profile page's "missing author row" fallback, which now goes through a
--    server action using the session's own user id (authorActions.ts). Fixed
--    search_path; service role only. handle_new_user (also SECURITY DEFINER, no
--    search_path) gets a fixed search_path too.
--
-- 3. generate_random_username() — the word lists had line breaks inside the
--    string literals ('Rad\n  iant'), so ~17% of generated usernames contained
--    "\n  ". Lists fixed; existing usernames repaired (whitespace removed, with
--    collisions given new digits), and the copies in
--    shared_notes_readers.reader_username renamed with them — private-share
--    access is matched on that column, so it must follow the author's username.
--
-- Safe to re-run: the repair only touches usernames that still contain
-- whitespace.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. author_id_by_email: service role only
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.author_id_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.author_id_by_email(text) TO service_role;

-- ---------------------------------------------------------------------------
-- 3a. generate_random_username: clean word lists (fixed search_path as well)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_random_username() RETURNS text
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
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
$$;

-- ---------------------------------------------------------------------------
-- 2. create_author_with_random_username / handle_new_user: fixed search_path,
--    create_author_with_random_username service role only
-- ---------------------------------------------------------------------------
-- Bodies already schema-qualify everything (public.*; built-ins are pg_catalog).
ALTER FUNCTION public.create_author_with_random_username(uuid) SET search_path TO '';
ALTER FUNCTION public.handle_new_user() SET search_path TO '';

REVOKE ALL ON FUNCTION public.create_author_with_random_username(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_author_with_random_username(uuid) TO service_role;

-- handle_new_user returns `trigger`, so it can't be called over the API anyway;
-- drop the API roles' grants so it doesn't show up as callable.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3b. Repair existing usernames containing whitespace
-- ---------------------------------------------------------------------------
-- New name = old name with all whitespace removed. If that is already taken
-- (case-insensitively — share-by-username looks names up with ILIKE), the
-- trailing 4 digits are re-rolled until it's free; after 50 tries the first 8
-- characters of the user id are appended instead. Rows are processed oldest
-- first, so a collision between two broken names resolves in favour of the
-- older account. Reader rows follow: matched by reader_id, or by the old
-- username where reader_id is missing.
DO $$
DECLARE
  r RECORD;
  candidate TEXT;
  stem TEXT;
  tries INT;
  n_authors INT := 0;
  n_collisions INT := 0;
  n_readers INT := 0;
  n INT;
BEGIN
  FOR r IN
    SELECT id, username FROM public.authors
    WHERE username ~ '[[:space:]]'
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    candidate := regexp_replace(r.username, '[[:space:]]+', '', 'g');
    tries := 0;
    WHILE EXISTS (
      SELECT 1 FROM public.authors a
      WHERE lower(a.username) = lower(candidate) AND a.id <> r.id
    ) LOOP
      tries := tries + 1;
      IF tries = 1 THEN n_collisions := n_collisions + 1; END IF;
      stem := regexp_replace(regexp_replace(r.username, '[[:space:]]+', '', 'g'), '[0-9]+$', '');
      IF tries <= 50 THEN
        candidate := stem || lpad(floor(random() * 10000)::int::text, 4, '0');
      ELSE
        candidate := regexp_replace(r.username, '[[:space:]]+', '', 'g') || substr(r.id::text, 1, 8);
      END IF;
    END LOOP;

    UPDATE public.shared_notes_readers
       SET reader_username = candidate
     WHERE reader_id = r.id::text
        OR (reader_id IS NULL AND reader_username = r.username);
    GET DIAGNOSTICS n = ROW_COUNT;
    n_readers := n_readers + n;

    UPDATE public.authors SET username = candidate WHERE id = r.id;
    n_authors := n_authors + 1;
  END LOOP;

  RAISE NOTICE 'username repair: % author(s) renamed (% needed new digits after a collision), % shared_notes_readers row(s) updated',
    n_authors, n_collisions, n_readers;
END $$;

COMMIT;
