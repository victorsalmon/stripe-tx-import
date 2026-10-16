# Rate limits — Stripe (balance-transaction backfill)

Vendor docs are authoritative. Every figure below carries its source URL.
Anything we could not verify in vendor docs is marked **UNVERIFIED** — never
guessed.

## Request-rate limits (requests/second, per Stripe account)

| Resource | Limit |
| -------- | ----- |
| Global API rate limit | Live mode: 100 requests/second; Sandbox: 25 requests/second |
| Individual API endpoints (unless otherwise noted) | 25 requests/second |
| Search API | 20 read requests/second |
| Files API | 20 read/second, 20 write/second |
| Payouts API | 15 create requests/second; 30 concurrent requests per business |

- Source: <https://docs.stripe.com/rate-limits>

The `GET /v1/balance_transactions` list calls used by this package's
backfill fall under the **default per-endpoint 25 requests/second** bucket
(no endpoint-specific override is documented for it), inside the global
100/second (live) or 25/second (sandbox) cap.

## Read-volume allocation

- Read (GET) API requests must not exceed an **average of 500 per
  transaction**, measured over a rolling 30-day period.
  - Source: <https://docs.stripe.com/rate-limits>
- **UNVERIFIED**: the absolute minimum read allocation floor for
  low-transaction accounts (vendor text describes one but the figure was
  not legibly verifiable) — check the page above for the current wording
  before relying on it.

## The `429` shape

- Rate-limited requests return HTTP **`429 Too Many Requests`**.
  - Source: <https://docs.stripe.com/api/errors>
- The error body uses code **`rate_limit`** ("Too many requests hit the API
  too quickly. We recommend an exponential backoff of your requests.").
  - Source: <https://docs.stripe.com/error-codes>
- Rate-limited responses include a **`Stripe-Rate-Limited-Reason`** header
  with one of: `global-rate`, `endpoint-rate`, `global-concurrency`,
  `endpoint-concurrency`, `resource-specific`.
  - Source: <https://docs.stripe.com/rate-limits>
- A `429` **without** those headers is not a rate limit — it may be a lock
  timeout (`lock_timeout`: another request holds the object lock; retryable
  but unprocessed and unassigned a request ID). Stripe SDKs automatically
  retry `429`s caused by lock timeouts, but **not** `429`s caused by rate
  limits — the app must implement its own backoff.
  - Source: <https://docs.stripe.com/rate-limits>
- The **`Stripe-Should-Retry`** response header gives retry guidance:
  `true` = retry with exponential backoff; `false` = do not retry; absent =
  decide from status code and body.
  - Source: <https://docs.stripe.com/error-low-level>

## Idempotent-GET retry guidance (this package's backfill)

- API v1 `GET` (and `DELETE`) requests are **idempotent by definition** —
  retrying them repeats no side effects.
  - Source: <https://docs.stripe.com/api/idempotent_requests>
- Do **not** send `Idempotency-Key` on `GET`/`DELETE`: it has no effect
  (keys are for `POST` only on API v1).
  - Source: <https://docs.stripe.com/api/idempotent_requests>
- Rate-limit errors occur **before endpoint execution begins**, so nothing
  is cached or half-applied — it is safe to retry the same `GET` after
  backing off.
  - Source: <https://docs.stripe.com/error-low-level>
- **UNVERIFIED**: numeric values for the global/endpoint **concurrency**
  limits (they exist as `429` reasons but are unpublished) — mitigate by
  keeping backfill concurrency at 1 (see checklist).

## Backfill guidance (this package)

- Page `balance_transactions.list` **serially** (`pageSize: 100`,
  `startingAfter` cursor); never fan list pages out in parallel.
- On `429`, back off exponentially with jitter and resume from the last
  stored cursor — pages are idempotent reads, so re-fetching is safe.
- Treat sandbox (25/second global) as the pacing floor so the same code
  stays under limits in both modes.

## HOST_CHECKLIST

- [ ] Jittered backoff: on `429`, retry with exponential backoff plus
      random jitter; never tight-loop.
- [ ] Retry-After respect: check `Stripe-Should-Retry` (`true` = back off
      and retry; `false` = stop) and any `Retry-After`-style wait directive
      before the next attempt.
- [ ] Per-tenant serialization: one backfill loop per Stripe account at a
      time; serialize requests that touch the same object to avoid
      `lock_timeout` `429`s.
- [ ] Alerting: log `429` counts by `Stripe-Rate-Limited-Reason`; alert on
      sustained `endpoint-rate`/`global-rate` (means pacing too aggressive)
      and on `lock_timeout` spikes (means concurrency too high).
