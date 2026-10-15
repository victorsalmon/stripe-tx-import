/**
 * Provider-neutral sales record for bookkeeping import.
 *
 * All money fields are integer minor units (cents for USD/CAD/…).
 * Stripe reports amounts in cents already — values are passed through,
 * never multiplied.
 */
export interface SalesRecord {
  /** Balance-transaction id (e.g. `txn_…`). Globally unique per record. */
  externalId: string;
  /** ISO 8601 timestamp derived from the balance transaction `created`. */
  date: string;
  /** Gross amount in minor units, as reported by Stripe. */
  grossCents: number;
  /**
   * Tax amount in minor units, or `null` when unknown.
   *
   * Stripe payments carry no universal tax field, so this stays `null`
   * unless the caller supplies a tax figure (e.g. from the related
   * charge's `tax_rates` expansion) via the adapter options.
   */
  taxCents: number | null;
  /** Total processing fees in minor units (sum of `fee_details`). */
  feeCents: number;
  /** Net amount in minor units (`grossCents - feeCents`, as reported). */
  netCents: number;
  /** Lowercase ISO currency code (e.g. `cad`). */
  currency: string;
  /**
   * Balance-transaction `type` (e.g. `charge`, `refund`, `payout`,
   * `stripe_fee`). See {@link reportingCategory} for the Stripe
   * reporting bucket.
   */
  kind: string;
  /** Stripe reporting category (e.g. `charge`, `refund`, `payout`, `fee`). */
  reportingCategory: string | null;
  /** Refund id (`re_…`) this record reverses, when the source is a refund. */
  refundOf?: string;
  /** Payout id (`po_…`) this record belongs to, when known. */
  payoutId?: string;
  provider: 'stripe';
  /** The original balance-transaction JSON, preserved for audit. */
  rawJson: unknown;
}
