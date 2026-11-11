-- Scheduled account deletion with a 30-day grace window. A request cancels the
-- Stripe subscription, records a purge date, and the app hides behind a
-- restore/confirm gate; a cron hard-purges after the window. Recoverable until
-- then by deleting the row (restore).

CREATE TABLE IF NOT EXISTS public.account_deletions (
  user_id         UUID PRIMARY KEY,
  email           TEXT,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  purge_at        TIMESTAMPTZ NOT NULL,
  stripe_canceled BOOLEAN NOT NULL DEFAULT false,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'purging', 'done'))
);

CREATE INDEX IF NOT EXISTS account_deletions_due_idx
  ON public.account_deletions (status, purge_at);

ALTER TABLE public.account_deletions ENABLE ROW LEVEL SECURITY;

-- A user may see their own pending deletion (to show the gate) and cancel it
-- (restore) while it's still pending. Inserts + the purge run server-side with
-- the service role.
DROP POLICY IF EXISTS account_deletions_select ON public.account_deletions;
CREATE POLICY account_deletions_select ON public.account_deletions
  FOR SELECT USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS account_deletions_cancel ON public.account_deletions;
CREATE POLICY account_deletions_cancel ON public.account_deletions
  FOR DELETE USING (user_id = (select auth.uid()) AND status = 'pending');
