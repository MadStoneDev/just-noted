-- Self-serve account export. A request creates a row and enqueues a QStash job
-- (payload = export id only, never content); the worker gathers the user's data,
-- uploads it to the PRIVATE R2 bucket, and marks the row ready. Downloads are
-- short-lived presigned URLs. Rows + objects are deleted after 7 days (and on
-- account deletion).

CREATE TABLE IF NOT EXISTS public.account_exports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  storage_key TEXT,
  size_bytes  BIGINT,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS account_exports_user_idx
  ON public.account_exports (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS account_exports_expiry_idx
  ON public.account_exports (expires_at);

ALTER TABLE public.account_exports ENABLE ROW LEVEL SECURITY;

-- A user sees their own exports. Creation, processing and cleanup run
-- server-side with the service role.
DROP POLICY IF EXISTS account_exports_select ON public.account_exports;
CREATE POLICY account_exports_select ON public.account_exports
  FOR SELECT USING (user_id = (select auth.uid()));
