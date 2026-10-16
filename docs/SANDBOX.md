# Dev-sandbox runbook

Prove this package against a Stripe sandbox **before** pointing it at
anything real. The library is code-ready (unit + property suites,
`npm test`) but sandbox-unproven: the first live `balance_transactions`
list and the first signed webhook should both happen here.

> For assisted signup (a guided hand through the Stripe account /
> sandbox creation clicks), use the fleet `web-create-account` skill.
> This runbook covers what to do once the account exists.

## 1. Account + sandbox model

1. Sign up at the Stripe website (email + business details — no code,
   no API calls needed for this step).
2. Work in a **named dev sandbox** for this integration — not the bare
   shared test mode. Per the Stripe docs, named sandboxes give a new
   integration an isolated settings/keys/webhook-endpoint set, so seed
   charges, test clocks, and webhook secrets cannot leak into other
   work. Tear the sandbox down (or mint a fresh one) when the seed
   data gets messy instead of reusing one sandbox across integrations.
3. Keep the library's pinned API version aligned:
   `STRIPE_API_VERSION = '2026-09-30.endive'` (exported from
   `src/index.ts`, applied by `createStripeClient`). Set the **same**
   version on the sandbox webhook endpoint (Developers → Webhooks →
   API version) so signed event shapes match the installed `stripe`
   SDK — see [`docs/WEBHOOKS.md`](./WEBHOOKS.md).

## 2. Test keys (where they live)

Sandbox keys live in the Stripe dashboard under **Developers → API
keys** while the sandbox is selected. You need only the secret key for
this package:

| Env var | Value | Used by |
| :--- | :--- | :--- |
| `STRIPE_SECRET_KEY` | Sandbox secret key (test-mode key) | `createStripeClient` — backfill (`examples/backfill.mjs`) and smoke (`examples/sandbox-smoke.mjs`) |
| `STRIPE_WEBHOOK_SECRET` | Sandbox webhook endpoint secret (endpoint → Signing secret) | `verifySalesWebhook` (`examples/verify-webhook.mjs`) |

Rules:

- Export keys into the environment only (`export STRIPE_SECRET_KEY=…`
  / `$env:STRIPE_SECRET_KEY=…`). Never commit them, never paste them
  into docs, chat logs, or fixtures.
- Sandbox keys stay in the sandbox. A live key must never appear in
  `STRIPE_SECRET_KEY` during integration work.

## 3. Seed guidance

The sandbox starts empty, and `balance_transactions` only lists what
has moved money. Generate activity with test-mode payments:

- **Test cards** — the `4242…` series from the Stripe testing docs
  (e.g. the basic `4242 4242 4242 4242` Visa approval, any future
  expiry, any CVC) through a sandbox payment form, Payment Link, or
  the API. Each captured charge yields a `charge`-type balance
  transaction; refund one to get a `refund` record with the `re_`
  source linkage this library maps to `refundOf`.
- **Test clocks** — for time-travel (trials, renewals) without
  waiting. Useful for generating volume; not required for the smoke
  check.
- **Payouts** — sandbox payouts appear on their own cadence; the
  `po_`-sourced linkage maps to `payoutId`. Do not wait for one to
  run the smoke — charges alone prove the wiring.

Two or three test charges are enough for the smoke script below.

## 4. Smoke check

```bash
npm run build
node examples/sandbox-smoke.mjs   # needs STRIPE_SECRET_KEY (sandbox key)
```

The script pages `backfillBalanceTransactions` over a deliberately
small window (`pageSize: 3`, `maxPages: 2`, running count per page)
and prints only counts plus one projected line per record
(`externalId`, `date`, `grossCents`, `feeCents`, `netCents`,
`currency`, `kind`) — no raw payloads, no credential values. With
`STRIPE_SECRET_KEY` unset it exits non-zero with a names-only message
(fail-closed; the missing-env path is the zero-network proof).

Success looks like: page counts print, then one line per record with
sane cents (`grossCents - feeCents === netCents`, `currency: "usd"`
or your sandbox currency, `kind: "charge"`).

## 5. Webhooks against localhost

Sandbox events reach a local handler via the Stripe CLI forwarder —
no public URL needed:

```bash
stripe listen --forward-to localhost:4242/webhooks/stripe
```

Point the command at whatever port/path your handler serves, trigger
a test charge in the sandbox, and handle the signal per
[`docs/WEBHOOKS.md`](./WEBHOOKS.md): verify → HTTP 200 → fetch +
expand the authoritative object → map with
`balanceTransactionToSalesRecord` → upsert on `externalId`,
deduplicating on the event id. For the offline shape of this flow,
see `examples/verify-webhook.mjs`.
