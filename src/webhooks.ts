import type Stripe from 'stripe';

/**
 * Webhook event types this library treats as sales signals.
 *
 * A signal is a trigger to fetch-and-expand the authoritative object
 * (`GET /v1/balance_transactions`, charges, or payouts) — never a source
 * to book from directly. Event payloads are snapshots: they can arrive
 * out of order, be redelivered, or omit expanded fields the ledger needs.
 */
export const SUPPORTED_SALES_SIGNALS = [
  'charge.succeeded',
  'charge.refunded',
  'payout.paid',
] as const;

export type SalesSignal = (typeof SUPPORTED_SALES_SIGNALS)[number];

export function isSupportedSalesSignal(type: string): type is SalesSignal {
  return (SUPPORTED_SALES_SIGNALS as readonly string[]).includes(type);
}

/**
 * Minimal structural view of the stripe webhook verifier. Accepts the
 * real `Stripe` instance (`stripe.webhooks`) as well as test doubles.
 * Verification is local HMAC crypto — no network is involved.
 */
export interface WebhookVerifier {
  constructEvent(
    payload: string | Uint8Array,
    header: string | string[] | Uint8Array,
    secret: string,
    tolerance?: number,
  ): Stripe.Event;
}

export interface VerifySalesWebhookOptions {
  /**
   * The raw request body, exactly as received — before `JSON.parse`.
   * Strings are UTF-8 encoded; Buffers/Uint8Arrays are used as-is.
   */
  payload: string | Uint8Array;
  /** Value of the `stripe-signature` request header. */
  signatureHeader: string | string[];
  /** Webhook endpoint secret (`whsec_…`) from the Stripe dashboard. */
  webhookSecret: string;
  /** Stripe client (or test double) used only for local verification. */
  stripeClient: { webhooks: WebhookVerifier };
  /**
   * Signature timestamp tolerance in seconds. Omit in production so the
   * SDK default (`DEFAULT_TOLERANCE`, 300 s) applies.
   *
   * Passing `0` disables the recency check — tests only, never production.
   */
  tolerance?: number;
}

/**
 * A verified sales signal, ready for signal-then-poll-expand.
 */
export interface SalesSignalEvent {
  type: SalesSignal;
  /** Stripe event id (`evt_…`) — use for idempotent handling. */
  eventId: string;
  created: Date;
  /**
   * Best-effort `balance_transaction` id from the event object
   * (`charge.succeeded` / `charge.refunded` charges and `payout.paid`
   * payouts carry one when the API version expands it as a string).
   * `null` when absent or still an unexpanded id-less shape — poll the
   * object from the API in that case.
   */
  balanceTransactionId: string | null;
  /** The verified Stripe event. */
  rawEvent: Stripe.Event;
}

/** Thrown when a verified event is not one of {@link SUPPORTED_SALES_SIGNALS}. */
export class UnsupportedEventTypeError extends Error {
  readonly eventType: string;
  constructor(eventType: string) {
    super(
      `Unsupported Stripe event type for sales import: ${eventType}. ` +
        `Supported signals: ${SUPPORTED_SALES_SIGNALS.join(', ')}. ` +
        'Acknowledge the event (HTTP 200) and ignore it.',
    );
    this.name = 'UnsupportedEventTypeError';
    this.eventType = eventType;
  }
}

function balanceTransactionIdOf(event: Stripe.Event): string | null {
  const object = event.data?.object as
    | { balance_transaction?: string | { id?: string } | null }
    | null
    | undefined;
  const bt = object?.balance_transaction;
  if (typeof bt === 'string') return bt;
  if (bt !== null && typeof bt === 'object' && typeof bt.id === 'string') return bt.id;
  return null;
}

/**
 * Verify a Stripe webhook signature and, when the event is a supported
 * sales signal, return it for signal-then-poll-expand handling.
 *
 * Signature failures propagate the SDK's
 * `StripeSignatureVerificationError` (caller maps to HTTP 401).
 * Verified-but-unsupported event types throw
 * {@link UnsupportedEventTypeError} (caller maps to HTTP 200 + ignore).
 *
 * Never books from the event alone: after this returns, fetch the
 * authoritative object (`GET /v1/balance_transactions` or the expanded
 * charge/payout) and map it with `balanceTransactionToSalesRecord`.
 */
export function verifySalesWebhook(opts: VerifySalesWebhookOptions): SalesSignalEvent {
  const event =
    opts.tolerance === undefined
      ? opts.stripeClient.webhooks.constructEvent(
          opts.payload,
          opts.signatureHeader,
          opts.webhookSecret,
        )
      : opts.stripeClient.webhooks.constructEvent(
          opts.payload,
          opts.signatureHeader,
          opts.webhookSecret,
          opts.tolerance,
        );
  if (!isSupportedSalesSignal(event.type)) {
    throw new UnsupportedEventTypeError(event.type);
  }
  return {
    type: event.type,
    eventId: event.id,
    created: new Date(event.created * 1000),
    balanceTransactionId: balanceTransactionIdOf(event),
    rawEvent: event,
  };
}
