# Scribe pricing change — November 2026

New Scribe prices for new subscribers: **A$7/month** or **A$70/year** (two months
free). The original A$5/month price is no longer sold, but the webhook still
recognises it, so any subscription on it keeps Scribe.

Checkout moved from the public Payment Link to **server-created Checkout
Sessions** (`createScribeCheckout` in `src/app/actions/billingActions.ts`). The
price comes from env, the signed-in account is attached server-side, and anyone
who already has Scribe (including manual/comped accounts) is never sent to
checkout.

## Env vars

| Var | Value | Notes |
|---|---|---|
| `STRIPE_SCRIBE_MONTHLY_PRICE_ID` | new A$7/month price | **new** — from the live prices script |
| `STRIPE_SCRIBE_YEARLY_PRICE_ID` | new A$70/year price | **new** — from the live prices script |
| `STRIPE_SCRIBE_PRICE_ID` | original A$5 price | **unchanged — leave it set** (webhook recognition only) |
| `NEXT_PUBLIC_APP_URL` | `https://justnoted.app` | already set; builds the success/cancel URLs |
| `NEXT_PUBLIC_STRIPE_SCRIBE_PAYMENT_LINK` | — | no longer read; remove whenever |

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

The live prices have to exist before the env vars can be filled in, so the
prices script runs first. Creating prices is harmless: nothing can sell them
until the app points at them.

1. **Create the live prices** (you run this):
   ```bash
   STRIPE_LIVE_SECRET_KEY=sk_live_... node scripts/stripe-create-scribe-prices.mjs \
     --live --from-price <current STRIPE_SCRIBE_PRICE_ID> --dry-run   # check first
   STRIPE_LIVE_SECRET_KEY=sk_live_... node scripts/stripe-create-scribe-prices.mjs \
     --live --from-price <current STRIPE_SCRIBE_PRICE_ID>
   ```
   It adds both prices to the existing Scribe product (the A$5 price's product),
   copies that price's tax behaviour, and prints the two env lines. Re-running is
   safe (lookup keys `scribe_aud_7_month`, `scribe_aud_70_year`). The key needs
   Products + Prices write; the app's `rk_live_` key doesn't have that, so use a
   full secret key or a separate restricted key.
2. **Coolify env:** add `STRIPE_SCRIBE_MONTHLY_PRICE_ID` and
   `STRIPE_SCRIBE_YEARLY_PRICE_ID`; keep `STRIPE_SCRIBE_PRICE_ID`; add Checkout
   Sessions: Write to the app's restricted key.
3. **SQL:** migration, then backfill preview (+ update if it returns rows).
   Before the deploy: the new webhook writes `stripe_price_id`, and without the
   column every webhook would fail (Stripe retries for 3 days, so it would
   recover, but don't rely on it).
4. **Deploy** `prelaunch/playwright-and-b7`.
5. **Smoke test:** /pricing shows A$7/month ↔ A$70/year; a manual account
   shows "Complimentary" with no Upgrade button; a Draft account reaches Stripe
   Checkout for each interval (cancel out on Stripe's page → back on /pricing).
6. **Deactivate the old Payment Link** (Stripe → Payment Links → … →
   Deactivate) so the A$5 price can't be bought from a saved link. Archiving the
   A$5 price is optional; existing subscriptions on it keep renewing either way.
7. **Customer Portal:** confirm plan switching is off (Settings → Billing →
   Customer portal → Subscriptions → "Customers can switch plans").

## Checkout settings carried over from the Payment Link

These couldn't be read from the live dashboard (no live access from the repo),
so they're set to the values below in `CHECKOUT_SETTINGS`
(`src/lib/stripe-checkout.ts`). Check each against the old Payment Link:

| Setting | New Checkout Session | Check on the Payment Link |
|---|---|---|
| Automatic tax / GST | off | "Collect tax automatically" — expected off (not GST-registered) |
| Billing address | `auto` (only when the card needs it) | "Collect customers' addresses" — if *required*, set `billingAddressCollection: "required"` |
| Promotion codes | off | "Allow promotion codes" |
| Success URL | `/pricing?checkout=success` (shows a welcome toast) | "After payment" — confirmation page or redirect? |
| Cancel URL | `/pricing?checkout=cancelled` | (Payment Links have none) |
| Free trial | none | Any trial days on the link? |
| Phone / tax ID / custom fields / terms consent | none | Any of these enabled? |

Payment methods: Checkout Sessions use the account's dynamic payment methods,
the same as Payment Links.

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
