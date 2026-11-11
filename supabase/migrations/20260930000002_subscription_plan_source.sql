-- Track how a user got their plan so manual/comped Scribe accounts are handled
-- correctly: they have no Stripe customer, so a "Manage billing" button can only
-- fail, and billing sync must never clobber them.
--
-- plan_source: 'stripe' (billing-managed, the default) or 'manual' (comped/admin
-- grant, no Stripe). NOT NULL DEFAULT 'stripe' backfills every existing row as
-- 'stripe'. comp_until optionally bounds a manual grant — once it passes, the
-- account resolves back to the free tier (checked at read time in getUserTier).

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS plan_source TEXT NOT NULL DEFAULT 'stripe',
  ADD COLUMN IF NOT EXISTS comp_until TIMESTAMPTZ;

ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_plan_source_check;
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_plan_source_check
    CHECK (plan_source IN ('stripe', 'manual'));
