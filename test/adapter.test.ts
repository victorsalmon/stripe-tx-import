import { describe, expect, it } from 'vitest';
import {
  balanceTransactionToSalesRecord,
  type BalanceTransactionLike,
} from '../src/adapter.js';

const CREATED = 1_759_900_800; // 2026-10-05T00:00:00Z
const ISO = new Date(CREATED * 1000).toISOString();

function chargeBt(overrides: Partial<BalanceTransactionLike> = {}): BalanceTransactionLike {
  return {
    id: 'txn_3P1aBcDeFgHiJk01',
    created: CREATED,
    amount: 5000,
    currency: 'cad',
    fee: 175,
    fee_details: [
      { amount: 145, type: 'stripe_fee', description: 'Stripe processing fees' },
      { amount: 30, type: 'stripe_fee', description: 'Stripe billing' },
    ],
    net: 4825,
    type: 'charge',
    reporting_category: 'charge',
    source: 'ch_3P1aBcDeFgHiJk01',
    ...overrides,
  };
}

describe('balanceTransactionToSalesRecord', () => {
  it('maps a charge: cents pass through, tax stays null', () => {
    const record = balanceTransactionToSalesRecord(chargeBt());

    expect(record).toMatchObject({
      externalId: 'txn_3P1aBcDeFgHiJk01',
      date: ISO,
      grossCents: 5000,
      taxCents: null,
      feeCents: 175,
      netCents: 4825,
      currency: 'cad',
      kind: 'charge',
      reportingCategory: 'charge',
      provider: 'stripe',
    });
    expect(record).not.toHaveProperty('refundOf');
    expect(record).not.toHaveProperty('payoutId');
    expect(record.rawJson).toBeDefined();
  });

  it('lowercases an uppercase currency code', () => {
    const record = balanceTransactionToSalesRecord(chargeBt({ currency: 'CAD' }));
    expect(record.currency).toBe('cad');
  });

  it('sets taxCents only when charge tax is supplied', () => {
    const record = balanceTransactionToSalesRecord(chargeBt(), { chargeTaxCents: 250 });
    expect(record.taxCents).toBe(250);
  });

  it('links a refund to its refund id via the re_ source', () => {
    const record = balanceTransactionToSalesRecord(
      chargeBt({
        id: 'txn_3P1refund00000001',
        amount: -5000,
        fee: -175,
        fee_details: [{ amount: -175, type: 'stripe_fee' }],
        net: -4825,
        type: 'refund',
        reporting_category: 'refund',
        source: 're_3P1aBcDeFgHiJk01',
      }),
    );

    expect(record.kind).toBe('refund');
    expect(record.refundOf).toBe('re_3P1aBcDeFgHiJk01');
    expect(record.grossCents).toBe(-5000);
    expect(record).not.toHaveProperty('payoutId');
  });

  it('links a payout to its own po_ source', () => {
    const record = balanceTransactionToSalesRecord(
      chargeBt({
        id: 'txn_3P1payout0000001',
        amount: -4825,
        fee: 0,
        fee_details: [],
        net: -4825,
        type: 'payout',
        reporting_category: 'payout',
        source: 'po_1P2payout0000001',
      }),
    );

    expect(record.kind).toBe('payout');
    expect(record.payoutId).toBe('po_1P2payout0000001');
    expect(record.feeCents).toBe(0);
    expect(record).not.toHaveProperty('refundOf');
  });

  it('maps a standalone fee with a null source and no linkage', () => {
    const record = balanceTransactionToSalesRecord(
      chargeBt({
        id: 'txn_3P1fee0000000001',
        amount: -100,
        fee: 0,
        fee_details: [],
        net: -100,
        type: 'stripe_fee',
        reporting_category: 'fee',
        source: null,
      }),
    );

    expect(record.kind).toBe('stripe_fee');
    expect(record.grossCents).toBe(-100);
    expect(record).not.toHaveProperty('refundOf');
    expect(record).not.toHaveProperty('payoutId');
  });

  it('honours the legacy automatic_transfer payout linkage', () => {
    const record = balanceTransactionToSalesRecord(
      chargeBt({ automatic_transfer: 'po_legacy000000001' }),
    );

    expect(record.payoutId).toBe('po_legacy000000001');
  });

  it('accepts an expanded source object carrying an id', () => {
    const record = balanceTransactionToSalesRecord(
      chargeBt({ source: { id: 'ch_expanded00000001' } }),
    );

    expect(record).not.toHaveProperty('refundOf');
    expect(record).not.toHaveProperty('payoutId');
  });
});
