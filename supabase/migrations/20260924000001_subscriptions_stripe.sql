-- Switch billing from Paddle to Stripe. The subscriptions model (tier/status/
-- current_period_end/cancel_at_period_end) is unchanged; only the external
-- identifiers differ. The Paddle columns are left in place (harmless) so old
-- rows aren't lost.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

CREATE INDEX IF NOT EXISTS subscriptions_stripe_subscription_id_idx
  ON subscriptions (stripe_subscription_id);
