-- fix-storage-urls.sql
--
-- After migrating storage files, update all database references
-- from the old Supabase Cloud domain to the new self-hosted domain.
--
-- Usage:
--   1. Replace YOUR_NEW_DOMAIN below with your actual self-hosted Supabase domain
--   2. Run: psql <connection-string> < scripts/fix-storage-urls.sql
--
-- Run this AFTER importing data and AFTER migrating storage files.

-- ============================
-- CONFIGURATION — EDIT THIS
-- ============================

\set old_domain 'rnbzyxbugmpowkpbtdup.supabase.co'
\set new_domain 'YOUR_NEW_DOMAIN'

-- ============================

-- Preview what will be changed (dry run)
\echo '=== Preview: rows that will be updated ==='

\echo ''
\echo 'Notebook covers:'
SELECT id, LEFT(cover_value, 80) AS cover_url_preview
FROM notebooks
WHERE cover_type = 'custom'
  AND cover_value LIKE '%' || :'old_domain' || '%';

\echo ''
\echo 'Author avatars:'
SELECT id, LEFT(avatar_url, 80) AS avatar_url_preview
FROM authors
WHERE avatar_url LIKE '%' || :'old_domain' || '%';

\echo ''
\echo 'Note content with embedded images:'
SELECT id, LEFT(title, 40) AS title
FROM notes
WHERE content LIKE '%' || :'old_domain' || '%';

-- ============================
-- Apply the URL replacements
-- ============================

\echo ''
\echo '=== Applying URL replacements ==='

BEGIN;

-- Notebook cover URLs
UPDATE notebooks
SET cover_value = REPLACE(
  cover_value,
  'https://' || :'old_domain' || '/storage/v1/object/public/',
  'https://' || :'new_domain' || '/storage/v1/object/public/'
)
WHERE cover_type = 'custom'
  AND cover_value LIKE '%' || :'old_domain' || '%';

\echo 'Notebook covers updated.'

-- Author avatar URLs
UPDATE authors
SET avatar_url = REPLACE(
  avatar_url,
  'https://' || :'old_domain' || '/storage/v1/object/public/',
  'https://' || :'new_domain' || '/storage/v1/object/public/'
)
WHERE avatar_url LIKE '%' || :'old_domain' || '%';

\echo 'Author avatars updated.'

-- Inline images in note content (TipTap HTML may embed storage URLs)
UPDATE notes
SET content = REPLACE(
  content,
  'https://' || :'old_domain' || '/storage/v1/object/public/',
  'https://' || :'new_domain' || '/storage/v1/object/public/'
)
WHERE content LIKE '%' || :'old_domain' || '%';

\echo 'Note content URLs updated.'

-- Shared notes storage field (if any references exist)
UPDATE shared_notes
SET storage = REPLACE(
  storage,
  'https://' || :'old_domain' || '/storage/v1/object/public/',
  'https://' || :'new_domain' || '/storage/v1/object/public/'
)
WHERE storage LIKE '%' || :'old_domain' || '%';

\echo 'Shared notes storage URLs updated.'

COMMIT;

\echo ''
\echo '=== Done. All storage URLs have been updated. ==='
