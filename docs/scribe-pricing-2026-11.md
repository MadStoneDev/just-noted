# Scribe pricing change — November 2026

New Scribe prices for new subscribers: **A$7/month** or **A$70/year** (two months
free). The original A$5/month price is no longer sold, but the webhook still
recognises it, so any subscription on it keeps Scribe.

Checkout uses **server-created Checkout Sessions** (`createScribeCheckout` in
`src/app/actions/billingActions.ts`). The price comes from env, the signed-in account is attached server-side, and anyone
who already has Scribe (including manual/comped accounts) is never sent to
checkout.

## Env vars

| Var | Value | Notes |
|---|---|---|
| `STRIPE_SCRIBE_MONTHLY_PRICE_ID` | A$7/month price (tax inclusive) | **new** — created in the dashboard |
| `STRIPE_SCRIBE_YEARLY_PRICE_ID` | A$70/year price (tax inclusive) | **new** — created in the dashboard |
| `STRIPE_SCRIBE_PRICE_ID` | original A$5 price | **unchanged — leave it set** (webhook recognition only) |
| `NEXT_PUBLIC_APP_URL` | `https://justnoted.app` | already set; builds the success/cancel URLs |

`STRIPE_SECRET_KEY` (a restricted `rk_live_` key) now needs **Checkout Sessions:
Write** in addition to what it has (Subscriptions: Read, Customer portal: Write).
Without it, Upgrade shows "Couldn't start checkout" and the server logs a
permissions error.

## Database (run in Studio)

### 1. Migration

`supabase/migrations/20261125000000_subscription_price_id.sql`:

```sql
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;
```

### 2. Backfill (existing Stripe subscribers → the A$5 price)

Preview first. **Expected: 0 rows** — the only Scribe accounts are the two manual
ones, which the `plan_source = 'stripe'` filter excludes (and they have no
`stripe_subscription_id`). Any row this returns is someone who once completed a
live checkout (including a since-cancelled one or a test purchase).

```sql
select u.email, s.tier, s.status, s.plan_source, s.stripe_subscription_id, s.current_period_end
from subscriptions s join auth.users u on u.id = s.user_id
where s.plan_source = 'stripe'
  and s.stripe_subscription_id is not null
  and s.stripe_price_id is null;
```

Then (replace the placeholder with the current `STRIPE_SCRIBE_PRICE_ID`):

```sql
update subscriptions
set stripe_price_id = '<STRIPE_SCRIBE_PRICE_ID>'
where plan_source = 'stripe'
  and stripe_subscription_id is not null
  and stripe_price_id is null;
```

The column only drives the price text in Settings, never entitlement, so the
backfill can't change who has Scribe. The webhook also fills it on the next
subscription event, so skipping it only means "Renews …" shows without a price
until then.

### Manual accounts (verify, and future grants)

```sql
-- Both should show comp_until null and stripe_subscription_id null.
select u.email, s.tier, s.status, s.plan_source, s.comp_until, s.stripe_customer_id, s.stripe_subscription_id
from subscriptions s join auth.users u on u.id = s.user_id
where s.plan_source = 'manual';
```

Grant / remove: Admin → Users → Scribe toggle (`setUserScribe`), or the SQL in
the "Manual Scribe" section below.

## Deploy order

The live prices (A$7/month, A$70/year, tax inclusive) already exist in the
dashboard.

1. **Coolify env:** add `STRIPE_SCRIBE_MONTHLY_PRICE_ID` and
   `STRIPE_SCRIBE_YEARLY_PRICE_ID` (the two live price ids); keep
   `STRIPE_SCRIBE_PRICE_ID`; give the app's restricted key Checkout Sessions:
   Write.
2. **SQL:** migration, then backfill preview (+ update if it returns rows).
   Before the deploy: the new webhook writes `stripe_price_id`, and without the
   column every webhook would fail (Stripe retries for 3 days, so it would
   recover, but don't rely on it).
3. **Deploy** `prelaunch/playwright-and-b7`.
4. **Smoke test:** /pricing shows A$7/month ↔ A$70/year; a manual account
   shows "Complimentary" with no Upgrade button; a Draft account reaches Stripe
   Checkout for each interval with a promotion-code field (cancel out on
   Stripe's page → back on /pricing).
5. **Customer Portal:** confirm plan switching is off (Settings → Billing →
   Customer portal → Subscriptions → "Customers can switch plans").

## Post-deploy checks

- Real purchase: 100%-off promo code (1 redemption), test account, Monthly.
  Check Scribe turns on, Settings shows Renews … · A$7/month, cancel via
  Manage billing works. Delete the coupon after.

## Checkout settings

Set in `CHECKOUT_SETTINGS` (`src/lib/stripe-checkout.ts`):

| Setting | Value |
|---|---|
| Automatic tax (Stripe Tax) | off — prices are tax inclusive |
| Billing address | `auto` (only when the payment method needs it) |
| Promotion codes | on |
| Success URL | `/pricing?checkout=success` (shows a welcome toast) |
| Cancel URL | `/pricing?checkout=cancelled` |

Payment methods are the account's dynamic payment methods.

## Manual Scribe (grant / remove)

```sql
-- Check first: if they have a live Stripe subscription, cancel it in Stripe before granting.
select stripe_subscription_id, status, plan_source from subscriptions
where user_id = (select id from auth.users where email = 'person@example.com');

-- Grant (comp_until null = permanent; or a timestamptz to time-box it)
insert into subscriptions (user_id, tier, status, plan_source, comp_until, updated_at)
values ((select id from auth.users where email = 'person@example.com'), 'scribe', 'active', 'manual', null, now())
on conflict (user_id) do update
  set tier = 'scribe', status = 'active', plan_source = 'manual',
      comp_until = excluded.comp_until, stripe_subscription_id = null, updated_at = now();

-- Remove (only touches a manual grant)
update subscriptions
  set tier = 'draft', status = 'cancelled', plan_source = 'stripe', comp_until = null, updated_at = now()
where user_id = (select id from auth.users where email = 'person@example.com')
  and plan_source = 'manual';
```

What protects manual accounts (all covered by tests in
`src/lib/stripe-webhook.test.ts`, `src/lib/stripe-checkout.test.ts`,
`src/lib/manual-scribe.test.ts`):

- `resolvePlanTier` ignores Stripe status for manual rows; only an elapsed
  `comp_until` ends them.
- Subscription update/delete events only update rows with
  `plan_source = 'stripe'`.
- A checkout only takes over a manual row when it actually grants Scribe.
- Manual accounts are never sent to checkout (`checkoutBlockReason`).
- Admin grant clears `stripe_subscription_id`; admin revoke only touches manual
  rows.
