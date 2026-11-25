-- Record which Stripe price a subscription is on, so the app shows a subscriber
-- their own price (A$7/month, A$70/year, or the original A$5/month) instead of
-- today's list price. Written by the Stripe webhook on checkout and on every
-- subscription update. Null for manual (comped) grants and for rows that have
-- never had a Stripe subscription.
--
-- Backfill for existing rows (all on the original A$5 price) is a separate,
-- reviewed step — see docs/scribe-pricing-2026-11.md.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;
