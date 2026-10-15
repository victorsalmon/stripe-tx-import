# Scope

`@clocklobster/stripe-tx-import` imports Stripe **sales records for bookkeeping
only**. The authoritative source is `GET /v1/balance_transactions`; every
record maps to a provider-neutral `SalesRecord` (`src/types.ts`).

## In scope

- Balance-transaction → `SalesRecord` mapping (`src/adapter.ts`): charges,
  refunds (linked via the `re_` source), payouts (linked via the `po_`
  source or the legacy `automatic_transfer` field), and standalone-fee
  types such as `stripe_fee`.
- Webhook signature verification for `charge.succeeded`,
  `charge.refunded`, and `payout.paid` as **signal-then-poll-expand**
  (`src/webhooks.ts`).
- Page-by-page backfill of `/v1/balance_transactions` with
  `starting_after` / `ending_before` (`src/poll.ts`).

## Out of scope (rejected, not deferred)

- **Invoices, Credit Notes, Subscriptions.** Different aggregate roots with
  their own lifecycle (drafting, finalization, proration). A bookkeeping
  importer that conflates them with cash movement double-counts revenue.
  If they are ever needed, they belong in a separate package.
- **Batch API (write-only).** Evaluated and rejected: batch endpoints are
  a write-path optimization, and this library performs no writes. Reading
  back through a batch layer would add staleness with no benefit.
- **MCP / skills / analytics runtime code.** Agent conveniences
  (model-context servers, skill definitions, revenue dashboards) are
  dev-aids that live with the consuming application, not in a ledger
  import library. Shipping them here would couple bookkeeping correctness
  to tooling churn.
