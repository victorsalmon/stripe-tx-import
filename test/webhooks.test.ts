import { describe, expect, it } from 'vitest';
import Stripe from 'stripe';
import {
  UnsupportedEventTypeError,
  isSupportedSalesSignal,
  verifySalesWebhook,
} from '../src/webhooks.js';

const SECRET = 'whsec_test_secret_0123456789abcdef';
const WRONG_SECRET = 'whsec_wrong_secret_0123456789abcdef';

const stripe = new Stripe('sk_test_dummy_key_for_local_verification');

function eventPayload(type: string, balanceTransaction: unknown): string {
  return JSON.stringify({
    id: 'evt_3P1aBcDeFgHiJk01',
    object: 'event',
    api_version: '2026-09-30.endive',
    created: 1_759_900_800,
    type,
    data: {
      object: {
        id: type.startsWith('payout') ? 'po_1P2payout0000001' : 'ch_3P1aBcDeFgHiJk01',
        object: type.startsWith('payout') ? 'payout' : 'charge',
        balance_transaction: balanceTransaction,
      },
    },
  });
}

function sign(payload: string, timestamp?: number): string {
  return stripe.webhooks.generateTestHeaderString({
    payload,
    secret: SECRET,
    ...(timestamp === undefined ? {} : { timestamp }),
  });
}

describe('isSupportedSalesSignal', () => {
  it.each(['charge.succeeded', 'charge.refunded', 'payout.paid'])(
    'accepts %s',
    (type) => {
      expect(isSupportedSalesSignal(type)).toBe(true);
    },
  );

  it.each(['invoice.paid', 'customer.created', 'charge.failed', ''])(
    'rejects %s',
    (type) => {
      expect(isSupportedSalesSignal(type)).toBe(false);
    },
  );
});

describe('verifySalesWebhook', () => {
  it.each([
    ['charge.succeeded', 'txn_3P1aBcDeFgHiJk01'],
    ['charge.refunded', 'txn_3P1aBcDeFgHiJk02'],
    ['payout.paid', 'txn_3P1aBcDeFgHiJk03'],
  ])('accepts a signed %s signal with default tolerance', (type, txn) => {
    const payload = eventPayload(type, txn);
    const signal = verifySalesWebhook({
      payload,
      signatureHeader: sign(payload),
      webhookSecret: SECRET,
      stripeClient: stripe,
    });

    expect(signal.type).toBe(type);
    expect(signal.eventId).toBe('evt_3P1aBcDeFgHiJk01');
    expect(signal.balanceTransactionId).toBe(txn);
    expect(signal.created).toEqual(new Date(1_759_900_800 * 1000));
  });

  it('extracts an expanded balance-transaction object', () => {
    const payload = eventPayload('charge.succeeded', { id: 'txn_expanded000001' });
    const signal = verifySalesWebhook({
      payload,
      signatureHeader: sign(payload),
      webhookSecret: SECRET,
      stripeClient: stripe,
    });

    expect(signal.balanceTransactionId).toBe('txn_expanded000001');
  });

  it('returns null balanceTransactionId when the event carries none', () => {
    const payload = eventPayload('charge.succeeded', null);
    const signal = verifySalesWebhook({
      payload,
      signatureHeader: sign(payload),
      webhookSecret: SECRET,
      stripeClient: stripe,
    });

    expect(signal.balanceTransactionId).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const payload = eventPayload('charge.succeeded', 'txn_3P1aBcDeFgHiJk01');
    const tampered = payload.replace('charge.succeeded', 'charge.refunded');

    expect(() =>
      verifySalesWebhook({
        payload: tampered,
        signatureHeader: sign(payload),
        webhookSecret: SECRET,
        stripeClient: stripe,
      }),
    ).toThrow();
  });

  it('rejects the wrong endpoint secret', () => {
    const payload = eventPayload('charge.succeeded', 'txn_3P1aBcDeFgHiJk01');

    expect(() =>
      verifySalesWebhook({
        payload,
        signatureHeader: sign(payload),
        webhookSecret: WRONG_SECRET,
        stripeClient: stripe,
      }),
    ).toThrow();
  });

  it('rejects a stale timestamp under the default tolerance', () => {
    const payload = eventPayload('charge.succeeded', 'txn_3P1aBcDeFgHiJk01');
    const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;

    expect(() =>
      verifySalesWebhook({
        payload,
        signatureHeader: sign(payload, oneHourAgo),
        webhookSecret: SECRET,
        stripeClient: stripe,
      }),
    ).toThrow();
  });

  it('accepts a stale timestamp only with the tests-only tolerance 0', () => {
    const payload = eventPayload('charge.succeeded', 'txn_3P1aBcDeFgHiJk01');
    const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;

    const signal = verifySalesWebhook({
      payload,
      signatureHeader: sign(payload, oneHourAgo),
      webhookSecret: SECRET,
      stripeClient: stripe,
      tolerance: 0,
    });

    expect(signal.type).toBe('charge.succeeded');
  });

  it('throws UnsupportedEventTypeError for a verified non-sales event', () => {
    const payload = eventPayload('invoice.paid', 'txn_3P1aBcDeFgHiJk01');

    let caught: unknown;
    try {
      verifySalesWebhook({
        payload,
        signatureHeader: sign(payload),
        webhookSecret: SECRET,
        stripeClient: stripe,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(UnsupportedEventTypeError);
    expect((caught as UnsupportedEventTypeError).eventType).toBe('invoice.paid');
  });
});
