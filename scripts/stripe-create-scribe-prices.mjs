#!/usr/bin/env node
// Create the Scribe A$7/month and A$70/year prices in Stripe. Safe to re-run:
// prices are found by lookup key and reused, never duplicated.
//
// Test mode (creates a "Scribe" product if there isn't one):
//   STRIPE_TEST_SECRET_KEY=sk_test_... node scripts/stripe-create-scribe-prices.mjs
//
// Live mode (adds the prices to the existing Scribe product — the product of
// the original A$5 price — and copies that price's tax behaviour):
//   STRIPE_LIVE_SECRET_KEY=sk_live_... node scripts/stripe-create-scribe-prices.mjs \
//     --live --from-price <current STRIPE_SCRIBE_PRICE_ID>
//
// Add --dry-run to print what would happen without creating anything.
// The key needs write access to Products and Prices (a restricted key works).
// Prints the env lines to set (STRIPE_SCRIBE_MONTHLY_PRICE_ID / _YEARLY_).

import Stripe from "stripe";

const args = process.argv.slice(2);
const live = args.includes("--live");
const dryRun = args.includes("--dry-run");
const fromPriceIdx = args.indexOf("--from-price");
const fromPrice = fromPriceIdx >= 0 ? args[fromPriceIdx + 1] : null;

const key = live ? process.env.STRIPE_LIVE_SECRET_KEY : process.env.STRIPE_TEST_SECRET_KEY;
const keyVar = live ? "STRIPE_LIVE_SECRET_KEY" : "STRIPE_TEST_SECRET_KEY";
if (!key) {
  console.error(`Set ${keyVar}.`);
  process.exit(1);
}
// Refuse a key from the wrong mode, so a test run can never touch live data.
const keyIsLive = /^(sk|rk)_live_/.test(key);
const keyIsTest = /^(sk|rk)_test_/.test(key);
if (live ? !keyIsLive : !keyIsTest) {
  console.error(`${keyVar} is not a ${live ? "live" : "test"}-mode key. Refusing.`);
  process.exit(1);
}
if (live && !fromPrice) {
  console.error("Live mode needs --from-price <current STRIPE_SCRIBE_PRICE_ID> so the new prices go on the existing Scribe product.");
  process.exit(1);
}

const stripe = new Stripe(key);

const PRICES = [
  { env: "STRIPE_SCRIBE_MONTHLY_PRICE_ID", lookup_key: "scribe_aud_7_month", unit_amount: 700, interval: "month", nickname: "Scribe monthly (A$7)" },
  { env: "STRIPE_SCRIBE_YEARLY_PRICE_ID", lookup_key: "scribe_aud_70_year", unit_amount: 7000, interval: "year", nickname: "Scribe yearly (A$70)" },
];

async function resolveProduct() {
  if (fromPrice) {
    const p = await stripe.prices.retrieve(fromPrice);
    if (p.currency !== "aud" || !p.recurring) {
      throw new Error(`${fromPrice} is not a recurring AUD price (${p.currency}, ${p.recurring ? "recurring" : "one-off"}).`);
    }
    const productId = typeof p.product === "string" ? p.product : p.product.id;
    console.log(`Product ${productId} (from ${fromPrice}: ${p.unit_amount / 100} ${p.currency.toUpperCase()}/${p.recurring.interval}, tax_behavior=${p.tax_behavior})`);
    return { productId, taxBehavior: p.tax_behavior ?? null };
  }
  // Test mode: find our product by metadata, or create it.
  const found = await stripe.products.search({ query: "metadata['justnoted_plan']:'scribe' AND active:'true'" });
  if (found.data[0]) {
    console.log(`Product ${found.data[0].id} (existing "${found.data[0].name}")`);
    return { productId: found.data[0].id, taxBehavior: null };
  }
  if (dryRun) {
    console.log('Would create product "Scribe"');
    return { productId: "(new product)", taxBehavior: null };
  }
  const product = await stripe.products.create({
    name: "Scribe",
    description: "JustNoted Scribe — live collaboration, unlimited notebooks, longer trash recovery and more version history.",
    metadata: { justnoted_plan: "scribe" },
  });
  console.log(`Product ${product.id} (created)`);
  return { productId: product.id, taxBehavior: null };
}

const { productId, taxBehavior } = await resolveProduct();
const existing = await stripe.prices.list({ lookup_keys: PRICES.map((p) => p.lookup_key), active: true, limit: 10 });

const out = [];
for (const spec of PRICES) {
  const have = existing.data.find((p) => p.lookup_key === spec.lookup_key);
  if (have) {
    const ok =
      have.unit_amount === spec.unit_amount && have.currency === "aud" && have.recurring?.interval === spec.interval;
    if (!ok) throw new Error(`Existing price ${have.id} for ${spec.lookup_key} doesn't match ${spec.nickname}. Fix it in the dashboard.`);
    const haveProduct = typeof have.product === "string" ? have.product : have.product.id;
    if (productId !== "(new product)" && haveProduct !== productId) {
      throw new Error(`Existing price ${have.id} (${spec.lookup_key}) is on product ${haveProduct}, not ${productId}.`);
    }
    console.log(`${spec.nickname}: ${have.id} (existing)`);
    out.push(`${spec.env}=${have.id}`);
    continue;
  }
  if (dryRun) {
    console.log(`Would create ${spec.nickname} on ${productId}`);
    continue;
  }
  const params = {
    product: productId,
    currency: "aud",
    unit_amount: spec.unit_amount,
    recurring: { interval: spec.interval },
    lookup_key: spec.lookup_key,
    nickname: spec.nickname,
    metadata: { justnoted_plan: "scribe" },
  };
  if (taxBehavior && taxBehavior !== "unspecified") params.tax_behavior = taxBehavior;
  const price = await stripe.prices.create(params);
  console.log(`${spec.nickname}: ${price.id} (created)`);
  out.push(`${spec.env}=${price.id}`);
}

if (out.length) {
  console.log(`\n# ${live ? "LIVE" : "TEST"} mode — set these:`);
  for (const line of out) console.log(line);
}
