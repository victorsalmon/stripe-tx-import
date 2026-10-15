// Verify a Stripe sales webhook signature (signal-then-poll-expand).
//
// Run with: npm run build && node examples/verify-webhook.mjs
// Requires: STRIPE_WEBHOOK_SECRET in the environment.
import {
  UnsupportedEventTypeError,
  createStripeClient,
  verifySalesWebhook,
} from '../dist/index.js';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
if (!webhookSecret) throw new Error('Set STRIPE_WEBHOOK_SECRET first');

// In a real handler, `rawBody` is the untouched request bytes and
// `signature` is the `stripe-signature` header.
const stripe = createStripeClient('sk_test_no_network_used_for_verify');
const rawBody = JSON.stringify({ id: 'evt_example', object: 'event' });
const signature = 't=123,v1=invalid';

try {
  const signal = verifySalesWebhook({
    payload: rawBody,
    signatureHeader: signature,
    webhookSecret,
    stripeClient: stripe,
  });
  console.log('signal verified:', signal.type, signal.eventId);
  console.log('now fetch + expand:', signal.balanceTransactionId);
} catch (err) {
  if (err instanceof UnsupportedEventTypeError) {
    console.log('verified but not a sales signal — 200 and ignore:', err.eventType);
  } else {
    console.log('signature invalid — 401');
  }
}
