-- Data minimisation for the deletion audit record: it doesn't need the email
-- (never used). The row keeps only user_id + timestamps + status, and completed
-- records are purged after 12 months by the cleanup cron.

ALTER TABLE public.account_deletions DROP COLUMN IF EXISTS email;
