-- pgTAP: author/username function hardening (20261111000001_harden_author_functions).
-- Run with: supabase test db
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path TO public, extensions;

SELECT plan(17);

-- A real user, created the way signup does it (the trigger makes the author row).
INSERT INTO auth.users (instance_id, id, aud, role, email, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001',
        'authenticated', 'authenticated', 'pgtap-owner@example.test', now(), now());

-- ---- signup trigger still works with the locked-down functions ------------
SELECT isnt(
  (SELECT username FROM public.authors WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  NULL, 'signup trigger creates an author row with a username');
SELECT unalike(
  (SELECT username FROM public.authors WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  '%' || E'\n' || '%', 'trigger-made username has no line break');

-- ---- privileges (catalog) -------------------------------------------------
SELECT ok(NOT has_function_privilege('anon', 'public.author_id_by_email(text)', 'EXECUTE'),
  'anon cannot execute author_id_by_email');
SELECT ok(NOT has_function_privilege('authenticated', 'public.author_id_by_email(text)', 'EXECUTE'),
  'authenticated cannot execute author_id_by_email');
SELECT ok(has_function_privilege('service_role', 'public.author_id_by_email(text)', 'EXECUTE'),
  'service_role can execute author_id_by_email');
SELECT ok(NOT has_function_privilege('anon', 'public.create_author_with_random_username(uuid)', 'EXECUTE'),
  'anon cannot execute create_author_with_random_username');
SELECT ok(NOT has_function_privilege('authenticated', 'public.create_author_with_random_username(uuid)', 'EXECUTE'),
  'authenticated cannot execute create_author_with_random_username');
SELECT ok(has_function_privilege('service_role', 'public.create_author_with_random_username(uuid)', 'EXECUTE'),
  'service_role can execute create_author_with_random_username');
SELECT ok(
  (SELECT proconfig @> ARRAY['search_path=""'] FROM pg_proc
    WHERE oid = 'public.create_author_with_random_username(uuid)'::regprocedure),
  'create_author_with_random_username has a fixed empty search_path');
SELECT ok(
  (SELECT proconfig @> ARRAY['search_path=""'] FROM pg_proc
    WHERE oid = 'public.handle_new_user()'::regprocedure),
  'handle_new_user has a fixed empty search_path');

-- ---- privileges (actual calls, as each API role) ---------------------------
SET LOCAL ROLE anon;
SELECT throws_ok($$ SELECT public.author_id_by_email('pgtap-owner@example.test') $$,
  '42501', NULL, 'anon call to author_id_by_email is denied');
SELECT throws_ok($$ SELECT public.create_author_with_random_username('aaaaaaaa-0000-0000-0000-0000000000ff') $$,
  '42501', NULL, 'anon call to create_author_with_random_username is denied');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT throws_ok($$ SELECT public.author_id_by_email('pgtap-owner@example.test') $$,
  '42501', NULL, 'authenticated call to author_id_by_email is denied');
SELECT throws_ok($$ SELECT public.create_author_with_random_username('aaaaaaaa-0000-0000-0000-0000000000ff') $$,
  '42501', NULL, 'authenticated call to create_author_with_random_username is denied');
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT is(public.author_id_by_email('  PGTAP-Owner@Example.test '),
  'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
  'service_role resolves an email (trimmed, case-insensitive) to the user id');
RESET ROLE;

-- ---- generator output ------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM (SELECT public.generate_random_username() AS u FROM generate_series(1, 5000)) s
    WHERE u ~ '[[:space:]]'),
  0, 'no whitespace in 5000 generated usernames');
SELECT is(
  (SELECT count(*)::int FROM (SELECT public.generate_random_username() AS u FROM generate_series(1, 5000)) s
    WHERE u !~ '^[A-Z][a-z]+[A-Z][a-z]+[0-9]{4}$'),
  0, 'every generated username is AdjectiveNoun + 4 digits');

SELECT * FROM finish();
ROLLBACK;
