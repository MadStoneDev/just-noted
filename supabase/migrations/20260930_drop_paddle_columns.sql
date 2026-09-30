-- Billing moved from Paddle to Stripe (see 20260924_subscriptions_stripe.sql),
-- which left the old Paddle identifier columns in place. Nothing in the codebase
-- reads or writes them any more, so drop them. Safe/idempotent.

ALTER TABLE subscriptions
  DROP COLUMN IF EXISTS paddle_subscription_id,
  DROP COLUMN IF EXISTS paddle_customer_id;
