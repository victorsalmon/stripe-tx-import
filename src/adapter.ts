import type { SalesRecord } from './types.js';

/**
 * The fee-detail fields the adapter tolerates. Only `amount` is read
 * (summed into `feeCents`); the rest are documented so fixtures and
 * hand-built payloads stay realistic without tripping excess-property
 * checks. Real `Stripe.BalanceTransaction` fee details are assignable.
 */
export interface FeeDetailLike {
  amount: number;
  application?: string | null;
  currency?: string | null;
  description?: string | null;
  type?: string | null;
}
/**
 * Minimal structural view of a Stripe balance transaction — just the
 * fields the adapter reads. Accepts the real `Stripe.BalanceTransaction`
 * as well as plain test fixtures.
 */
export interface BalanceTransactionLike {
  id: string;
  /** Unix seconds. */
  created: number;
  /** Gross amount in minor units (cents). Passed through, never scaled. */
  amount: number;
  currency: string;
  /** Total fees in minor units. Must equal the sum of `fee_details`. */
  fee: number;
  fee_details: FeeDetailLike[];
  /** Net amount in minor units (`amount - fee`). */
  net: number;
  /** Balance-transaction type, e.g. `charge`, `refund`, `payout`. */
  type: string;
  reporting_category?: string | null;
  /**
   * Originating object id (`ch_…`, `re_…`, `po_…`) or an expanded object
   * carrying an `id`. `null` for standalone fees.
   */
  source: string | { id: string } | null | undefined;
  /**
   * Legacy payout linkage. Current balance transactions expose the payout
   * through a `po_…` source; this field is honoured when present for
   * older payloads.
   */
  automatic_transfer?: string | null;
}

export interface AdapterOptions {
  /**
   * Tax in minor units, when the caller resolved it from the related
   * charge (e.g. via a `tax_rates` expansion). Stripe payments carry no
   * universal tax field, so `taxCents` stays `null` unless supplied here.
   */
  chargeTaxCents?: number | null;
}

function sourceId(source: BalanceTransactionLike['source']): string | null {
  if (source === null || source === undefined) return null;
  return typeof source === 'string' ? source : source.id;
}

/**
 * Map one balance transaction to a {@link SalesRecord}.
 *
 * Pure function — no I/O, no network. Amounts are already cents and are
 * passed through unchanged.
 *
 * - `externalId` is the balance-transaction id.
 * - `date` is `created` rendered as ISO 8601.
 * - `refundOf` is set when the source id starts with `re_`.
 * - `payoutId` is set when the source id starts with `po_` (payout
 *   transactions reference their own payout), or from the legacy
 *   `automatic_transfer` field when present.
 * - `taxCents` is `null` unless `opts.chargeTaxCents` is supplied.
 */
export function balanceTransactionToSalesRecord(
  bt: BalanceTransactionLike,
  opts: AdapterOptions = {},
): SalesRecord {
  const src = sourceId(bt.source);
  const record: SalesRecord = {
    externalId: bt.id,
    date: new Date(bt.created * 1000).toISOString(),
    grossCents: bt.amount,
    taxCents: opts.chargeTaxCents ?? null,
    feeCents: bt.fee,
    netCents: bt.net,
    currency: bt.currency.toLowerCase(),
    kind: bt.type,
    reportingCategory: bt.reporting_category ?? null,
    provider: 'stripe',
    rawJson: bt,
  };
  if (src !== null && src.startsWith('re_')) {
    record.refundOf = src;
  }
  if (src !== null && src.startsWith('po_')) {
    record.payoutId = src;
  } else if (typeof bt.automatic_transfer === 'string' && bt.automatic_transfer.length > 0) {
    record.payoutId = bt.automatic_transfer;
  }
  return record;
}
