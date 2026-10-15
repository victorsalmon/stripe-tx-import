import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  balanceTransactionToSalesRecord,
  type BalanceTransactionLike,
} from '../src/adapter.js';

/**
 * Money invariant: Stripe reports every amount in minor units, so the
 * adapter must preserve the ledger identity
 * `grossCents - feeCents === netCents` with
 * `feeCents === sum(fee_details)` — across generated transactions.
 */
describe('money invariants (property)', () => {
  const feeParts = (parts: number[]): Array<{ amount: number }> =>
    parts.map((amount) => ({ amount }));

  const transactionArb = fc
    .record({
      gross: fc.integer({ min: 1, max: 10_000_00 }),
      fees: fc.array(fc.integer({ min: 0, max: 500 }), {
        minLength: 1,
        maxLength: 4,
      }),
      currency: fc.constantFrom('cad', 'usd', 'CAD', 'EUR'),
      kind: fc.constantFrom('charge', 'refund', 'payout', 'stripe_fee'),
    })
    .map(({ gross, fees, currency, kind }) => {
      const fee = fees.reduce((sum, part) => sum + part, 0);
      const bt: BalanceTransactionLike = {
        id: `txn_prop_${gross}_${fee}`,
        created: 1_759_900_800,
        amount: gross,
        currency,
        fee,
        fee_details: feeParts(fees),
        net: gross - fee,
        type: kind,
        reporting_category: kind === 'stripe_fee' ? 'fee' : kind,
        source: null,
      };
      return bt;
    });

  it('grossCents - feeCents === netCents', () => {
    fc.assert(
      fc.property(transactionArb, (bt) => {
        const record = balanceTransactionToSalesRecord(bt);
        expect(record.grossCents - record.feeCents).toBe(record.netCents);
      }),
      { numRuns: 250 },
    );
  });

  it('feeCents === sum(fee_details) on the mapped record', () => {
    fc.assert(
      fc.property(transactionArb, (bt) => {
        const record = balanceTransactionToSalesRecord(bt);
        const details = (record.rawJson as BalanceTransactionLike).fee_details;
        const sum = details.reduce((total, part) => total + part.amount, 0);
        expect(record.feeCents).toBe(sum);
      }),
      { numRuns: 250 },
    );
  });

  it('currency is always normalized to lowercase', () => {
    fc.assert(
      fc.property(transactionArb, (bt) => {
        const record = balanceTransactionToSalesRecord(bt);
        expect(record.currency).toBe(record.currency.toLowerCase());
      }),
      { numRuns: 100 },
    );
  });
});
