# Webhooks: verify, then poll

Stripe webhooks are **signals, not ledger entries**. An event tells you
*something changed* — it does not carry the expanded, ordered,
idempotent view the books need. This library therefore verifies the
signature and hands you back just enough to fetch the truth:

1. Verify with `verifySalesWebhook({ payload, signatureHeader,
   webhookSecret, stripeClient })`.
2. Take `balanceTransactionId` (or the charge/payout id) and fetch the
   authoritative object from the API.
3. Map it with `balanceTransactionToSalesRecord` and upsert on
   `externalId`.

Deduplicate on the Stripe event id (`SalesSignalEvent.eventId`, `evt_…`)
— Stripe redelivers events.

## API version matching

The library pins `STRIPE_API_VERSION = '2026-09-30.endive'` (exported
from `src/index.ts`, created via `createStripeClient`) and the event
fixtures carry the same version. Set the **same** version on the Stripe
dashboard webhook endpoint (Developers → Webhooks → API version) so the
signed event shapes match the types in the installed `stripe` SDK.
A version mismatch does not break signature verification, but it can
change which fields are present on `data.object`.

## Timestamp tolerance

Verification uses the SDK default (`DEFAULT_TOLERANCE`, 300 s) unless a
`tolerance` is passed explicitly. Passing `tolerance: 0` disables the
recency check — **tests only, never production**: it exists so the test
suite can sign fixtures with fixed timestamps. Production callers omit
`tolerance` entirely.

## Responding to events

- Supported signal (`charge.succeeded`, `charge.refunded`,
  `payout.paid`) → HTTP 200, then poll-and-expand asynchronously.
- Verified but unsupported type → `UnsupportedEventTypeError`; HTTP 200
  and ignore (do not retry what you will never handle).
- Signature failure → HTTP 401, no further processing.
