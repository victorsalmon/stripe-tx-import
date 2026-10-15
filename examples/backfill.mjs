// Backfill Stripe sales history into provider-neutral records.
//
// Run with: npm run build && node examples/backfill.mjs
// Requires: STRIPE_SECRET_KEY in the environment.
import {
  backfillBalanceTransactions,
  createStripeBalanceTransactionClient,
  createStripeClient,
} from '../dist/index.js';

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) throw new Error('Set STRIPE_SECRET_KEY first');

const stripe = createStripeClient(secretKey);
const client = createStripeBalanceTransactionClient(stripe);

const records = await backfillBalanceTransactions(client, {
  pageSize: 100,
  onPage: (page, index) => console.log(`page ${index}: ${page.length} records`),
});

console.log(`imported ${records.length} sales records`);
console.log(records[0]);
