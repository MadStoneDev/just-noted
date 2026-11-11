-- Refine account_exports to the agreed export design: choose JSON or a Markdown
-- zip (format), include the requesting browser's local notes (anon_id), and keep
-- the small metadata row after expiry (add the 'expired' status).
--
-- Idempotent and self-sufficient: creates the table with the full schema if it
-- doesn't exist yet, or adds the new columns + updated checks if an earlier
-- version is already present. Safe to run once, either way.

CREATE TABLE IF NOT EXISTS public.account_exports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  format      TEXT NOT NULL DEFAULT 'json',
  status      TEXT NOT NULL DEFAULT 'pending',
  anon_id     TEXT,
  storage_key TEXT,
  size_bytes  BIGINT,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ
);

ALTER TABLE public.account_exports ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT 'json';
ALTER TABLE public.account_exports ADD COLUMN IF NOT EXISTS anon_id TEXT;

ALTER TABLE public.account_exports DROP CONSTRAINT IF EXISTS account_exports_format_check;
ALTER TABLE public.account_exports
  ADD CONSTRAINT account_exports_format_check CHECK (format IN ('json', 'markdown_zip'));

ALTER TABLE public.account_exports DROP CONSTRAINT IF EXISTS account_exports_status_check;
ALTER TABLE public.account_exports
  ADD CONSTRAINT account_exports_status_check
    CHECK (status IN ('pending', 'processing', 'ready', 'failed', 'expired'));

CREATE INDEX IF NOT EXISTS account_exports_user_idx
  ON public.account_exports (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS account_exports_expiry_idx
  ON public.account_exports (expires_at);

ALTER TABLE public.account_exports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS account_exports_select ON public.account_exports;
CREATE POLICY account_exports_select ON public.account_exports
  FOR SELECT USING (user_id = (select auth.uid()));
