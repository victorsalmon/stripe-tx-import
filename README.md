# `stripe-tx-import`

Import Stripe **sales records for bookkeeping** — nothing else. Balance
transactions map to provider-neutral `SalesRecord`s, sales webhooks verify
as signal-then-poll triggers, and history backfills page-by-page. See
[`docs/SCOPE.md`](./docs/SCOPE.md) for the boundary: no invoices, credit
notes, or subscriptions; no Batch API; no MCP/skills/analytics runtime.

---

## Installation

```bash
npm install @clocklobster/stripe-tx-import
```

Requires Node 20+ and `stripe ^23.0.0` (installed as a dependency).

---

## Quick start

### Map a balance transaction

```typescript
import { balanceTransactionToSalesRecord } from '@clocklobster/stripe-tx-import';

const [bt] = (await stripe.balanceTransactions.list({ limit: 1 })).data;
// Stripe amounts are already cents — passed through, never multiplied.
const record = balanceTransactionToSalesRecord(bt);
// { externalId: 'txn_…', grossCents, feeCents, netCents, taxCents: null, … }
```

`taxCents` stays `null`: Stripe payments carry no universal tax field.
When you resolve tax from the related charge (e.g. a `tax_rates`
expansion), pass it explicitly:

```typescript
balanceTransactionToSalesRecord(bt, { chargeTaxCents: 250 });
```

Refund linkage (`refundOf`) follows the `re_` source; payout linkage
(`payoutId`) follows the `po_` source (or the legacy
`automatic_transfer` field).

### Backfill history

```typescript
import {
  backfillBalanceTransactions,
  createStripeBalanceTransactionClient,
  createStripeClient,
} from '@clocklobster/stripe-tx-import';

const stripe = createStripeClient(process.env.STRIPE_SECRET_KEY!);
const client = createStripeBalanceTransactionClient(stripe);

const records = await backfillBalanceTransactions(client, {
  pageSize: 100,
  startingAfter: lastSeenTxnId, // resume cursor, optional
  onPage: (page, i) => console.log(`page ${i}: ${page.length} records`),
});
```

Runnable example: [`examples/backfill.mjs`](./examples/backfill.mjs) —
run with `npm run build && node examples/backfill.mjs`.

Rate limits, the `429` shape, and idempotent-GET retry guidance: [`docs/RATE_LIMITS.md`](./docs/RATE_LIMITS.md).

### Verify a webhook (signal, then poll)

```typescript
import {
  UnsupportedEventTypeError,
  verifySalesWebhook,
} from '@clocklobster/stripe-tx-import';

try {
  const signal = verifySalesWebhook({
    payload: rawBody, // raw bytes, before JSON.parse
    signatureHeader: req.headers['stripe-signature'],
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
    stripeClient: stripe,
  });
  // 200 — then fetch + expand signal.balanceTransactionId (never book
  // from the event alone). Deduplicate on signal.eventId.
} catch (err) {
  if (err instanceof UnsupportedEventTypeError) {
    // verified, but not charge.succeeded|refunded or payout.paid:
    // 200 and ignore.
  } else {
    // signature failure: 401.
  }
}
```

Runnable example: [`examples/verify-webhook.mjs`](./examples/verify-webhook.mjs).
Full policy: [`docs/WEBHOOKS.md`](./docs/WEBHOOKS.md).

---

## API version

The library pins `STRIPE_API_VERSION = '2026-09-30.endive'` (the bundled
SDK's own default) via `createStripeClient`. Set the same version on the
Stripe dashboard webhook endpoint so signed event shapes match these
types.

---

## Quality and test discipline

- `npm test` — vitest: unit tests with realistic fixtures (charge,
  refund, payout, standalone fee), webhook accept/reject, backfill
  pagination against a fake client, plus a fast-check property suite
  pinning `grossCents - feeCents === netCents` and
  `feeCents === sum(fee_details)`.
- `npm run typecheck` — `tsc --noEmit`.
- `npm run build` — emits `dist/` for publishing.

---

## License

MIT © Victor Salmon. See [LICENSE](./LICENSE).
