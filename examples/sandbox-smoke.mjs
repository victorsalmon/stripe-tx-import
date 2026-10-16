// Dev-sandbox smoke: prove the sandbox is wired without booking anything.
//
// Run with: npm run build && node examples/sandbox-smoke.mjs
// Requires: STRIPE_SECRET_KEY in the environment (a TEST-MODE or named
// dev-sandbox key only — never a live key). See docs/SANDBOX.md for setup.
// Makes read-only `GET /v1/balance_transactions` list calls only; no writes,
// no webhook delivery, no account changes.
//
// Output contract: counts plus one projected line per record —
// { externalId, date, grossCents, feeCents, netCents, currency, kind }.
// Never prints raw payloads (`rawJson`), full records, or credential values.
import {
  backfillBalanceTransactions,
  createStripeBalanceTransactionClient,
  createStripeClient,
} from '../dist/index.js';

// Small window on purpose: this is a wiring check, not an import.
const PAGE_SIZE = 3;
const MAX_PAGES = 2;

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  // Names only — never print a credential value, even when set.
  console.error('sandbox-smoke: STRIPE_SECRET_KEY is not set. Export your sandbox test key first (see docs/SANDBOX.md).');
  process.exit(2);
}

const stripe = createStripeClient(secretKey);
const client = createStripeBalanceTransactionClient(stripe);

let seen = 0;
try {
  const records = await backfillBalanceTransactions(client, {
    pageSize: PAGE_SIZE,
    maxPages: MAX_PAGES,
    onPage: (page, index) => {
      seen += page.length;
      console.log(`page ${index}: ${page.length} records (running total ${seen})`);
    },
  });

  console.log(`sandbox-smoke: imported ${records.length} sales records`);
  for (const record of records) {
    console.log({
      externalId: record.externalId,
      date: record.date,
      grossCents: record.grossCents,
      feeCents: record.feeCents,
      netCents: record.netCents,
      currency: record.currency,
      kind: record.kind,
    });
  }
} catch (err) {
  console.error(`sandbox-smoke: backfill failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
