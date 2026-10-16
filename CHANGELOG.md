# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] — 2026-10-16

### Added

- `docs/RATE_LIMITS.md`: vendor-verified Stripe limits for the backfill
  (global 100/second live / 25/second sandbox, default 25/second per
  endpoint, `429` + `rate_limit` + `Stripe-Rate-Limited-Reason` shape,
  `Stripe-Should-Retry` guidance, idempotent-GET retry rules) plus the host
  checklist. Numeric concurrency limits and the minimum read-allocation
  floor are marked UNVERIFIED (unpublished/illegible in vendor docs).

## [0.1.0] - 2026-10-15

### Added

- `SalesRecord` provider-neutral sales type (`src/types.ts`).
- `balanceTransactionToSalesRecord` pure adapter for Stripe balance
  transactions: charge, refund (`re_` source linkage), payout (`po_` source /
  legacy `automatic_transfer`), and standalone-fee types (`src/adapter.ts`).
- Stripe webhook signature verification for `charge.succeeded`,
  `charge.refunded`, and `payout.paid` as signal-then-poll-expand
  (`src/webhooks.ts`).
- Page-by-page `GET /v1/balance_transactions` backfill against an injected
  client interface — unit-testable without network (`src/poll.ts`).
- Pinned library default `STRIPE_API_VERSION = '2026-09-30.endive'`.
- Unit tests with realistic fixtures, a fast-check money invariant
  (`grossCents - feeCents === netCents`, `feeCents === sum(fee_details)`),
  and webhook accept/reject coverage.
