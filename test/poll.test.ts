import { describe, expect, it } from 'vitest';
import Stripe from 'stripe';
import type { BalanceTransactionLike } from '../src/adapter.js';
import {
  backfillBalanceTransactions,
  type BalanceTransactionListClient,
  type BalanceTransactionListParams,
  type BalanceTransactionPage,
} from '../src/poll.js';
import type { SalesRecord } from '../src/types.js';

function bt(id: string, amount = 1000): BalanceTransactionLike {
  return {
    id,
    created: 1_759_900_800,
    amount,
    currency: 'cad',
    fee: 30,
    fee_details: [{ amount: 30, type: 'stripe_fee' }],
    net: amount - 30,
    type: 'charge',
    reporting_category: 'charge',
    source: `ch_${id}`,
  };
}

class FakeClient implements BalanceTransactionListClient {
  readonly calls: BalanceTransactionListParams[] = [];
  constructor(private readonly queue: BalanceTransactionPage[]) {}

  async list(params: BalanceTransactionListParams): Promise<BalanceTransactionPage> {
    this.calls.push({ ...params });
    return this.queue.shift() ?? { data: [], has_more: false };
  }
}

describe('backfillBalanceTransactions', () => {
  it('chains starting_after across pages and maps every record', async () => {
    const client = new FakeClient([
      { data: [bt('txn_001'), bt('txn_002')], has_more: true },
      { data: [bt('txn_003')], has_more: true },
      { data: [bt('txn_004')], has_more: false },
    ]);
    const seen: SalesRecord[][] = [];

    const records = await backfillBalanceTransactions(client, {
      onPage: (page) => {
        seen.push(page);
      },
    });

    expect(records.map((r) => r.externalId)).toEqual([
      'txn_001',
      'txn_002',
      'txn_003',
      'txn_004',
    ]);
    expect(records.every((r) => r.provider === 'stripe')).toBe(true);
    expect(client.calls).toHaveLength(3);
    expect(client.calls[0]).toMatchObject({ limit: 100 });
    expect(client.calls[0]).not.toHaveProperty('starting_after');
    expect(client.calls[1]).toMatchObject({ limit: 100, starting_after: 'txn_002' });
    expect(client.calls[2]).toMatchObject({ limit: 100, starting_after: 'txn_003' });
    expect(seen).toHaveLength(3);
    expect(seen[0].map((r) => r.externalId)).toEqual(['txn_001', 'txn_002']);
  });

  it('resumes from startingAfter and bounds with endingBefore', async () => {
    const client = new FakeClient([{ data: [bt('txn_009')], has_more: false }]);

    await backfillBalanceTransactions(client, {
      startingAfter: 'txn_008',
      endingBefore: 'txn_010',
      pageSize: 25,
    });

    expect(client.calls).toEqual([
      { limit: 25, starting_after: 'txn_008', ending_before: 'txn_010' },
    ]);
  });

  it('returns an empty list for an empty ledger', async () => {
    const client = new FakeClient([{ data: [], has_more: false }]);

    await expect(backfillBalanceTransactions(client)).resolves.toEqual([]);
  });

  it('stops on an empty page even when has_more is stuck true', async () => {
    const client = new FakeClient([{ data: [], has_more: true }]);

    await expect(backfillBalanceTransactions(client)).resolves.toEqual([]);
    expect(client.calls).toHaveLength(1);
  });

  it('fails closed when maxPages is exhausted', async () => {
    const client = new FakeClient([
      { data: [bt('txn_001')], has_more: true },
      { data: [bt('txn_002')], has_more: true },
    ]);

    await expect(backfillBalanceTransactions(client, { maxPages: 1 })).rejects.toThrow(
      /maxPages \(1\)/,
    );
  });

  it('forwards adapter options such as chargeTaxCents', async () => {
    const client = new FakeClient([{ data: [bt('txn_001')], has_more: false }]);

    const [record] = await backfillBalanceTransactions(client, { chargeTaxCents: 65 });

    expect(record.taxCents).toBe(65);
  });
});

describe('library api-version pin', () => {
  it('matches the installed SDK default version', async () => {
    const { STRIPE_API_VERSION, createStripeClient } = await import('../src/index.js');

    expect(STRIPE_API_VERSION).toBe('2026-09-30.endive');
    expect(STRIPE_API_VERSION).toBe(Stripe.API_VERSION);

    const client = createStripeClient('sk_test_dummy_key_for_local_verification');
    expect(client).toBeInstanceOf(Stripe);
  });
});
