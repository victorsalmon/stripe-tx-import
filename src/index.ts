import Stripe from 'stripe';

export type { SalesRecord } from './types.js';
export {
  balanceTransactionToSalesRecord,
  type AdapterOptions,
  type BalanceTransactionLike,
  type FeeDetailLike,
} from './adapter.js';
export {
  SUPPORTED_SALES_SIGNALS,
  isSupportedSalesSignal,
  verifySalesWebhook,
  UnsupportedEventTypeError,
  type SalesSignal,
  type SalesSignalEvent,
  type VerifySalesWebhookOptions,
  type WebhookVerifier,
} from './webhooks.js';
export {
  backfillBalanceTransactions,
  createStripeBalanceTransactionClient,
  type BackfillOptions,
  type BalanceTransactionListClient,
  type BalanceTransactionListParams,
  type BalanceTransactionPage,
} from './poll.js';

/**
 * Stripe API version pinned as this library's default.
 *
 * This equals the `stripe` SDK's own `ApiVersion`, so client and
 * account payloads share one version. Set the same version on the
 * Stripe dashboard webhook endpoint (`Developers → Webhooks →
 * API version`) so signed event shapes match these types.
 */
export const STRIPE_API_VERSION: Stripe.LatestApiVersion = '2026-09-30.endive';

/**
 * Create a Stripe SDK client pinned to {@link STRIPE_API_VERSION}.
 * The pin keeps list/webhook payload shapes aligned with this
 * library's mappings regardless of the account default version.
 */
export function createStripeClient(
  secretKey: string,
  opts?: Omit<Stripe.StripeConfig, 'apiVersion'>,
): Stripe {
  return new Stripe(secretKey, { ...opts, apiVersion: STRIPE_API_VERSION });
}
