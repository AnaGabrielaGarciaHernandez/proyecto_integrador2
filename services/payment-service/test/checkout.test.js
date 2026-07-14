const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === '@ecobazar/contracts') {
    return { PaymentCheckoutRequestSchema: { parse: (value) => value } };
  }
  if (request === '@ecobazar/platform') {
    return {
      createHttpError(message, status, details) {
        return Object.assign(new Error(message), { status, details });
      },
    };
  }
  return originalLoad(request, parent, isMain);
};
const { createPaymentCheckoutService } = require('../src/services/checkout');
Module._load = originalLoad;

const REQUEST = {
  order_id: '11111111-1111-4111-8111-111111111111',
  order_number: 'ECO-2026-000001',
  buyer_id: '22222222-2222-4222-8222-222222222222',
  amount_cents: 25000,
  currency: 'MXN',
  expires_at: '2030-01-01T00:00:00.000Z',
  items: [{ product_name: 'Chamarra', size_name: 'M', quantity: 2, unit_price_cents: 12500 }],
};

test('creates Stripe Checkout with metadata, line items and order idempotency key', async () => {
  const fixture = createFixture();
  const result = await fixture.service.createCheckout(REQUEST, '33333333-3333-4333-8333-333333333333');

  assert.equal(result.checkout.session_id, 'cs_test');
  assert.equal(fixture.created.length, 1);
  assert.deepEqual(fixture.created[0].options, { idempotencyKey: `checkout-${REQUEST.order_id}` });
  assert.equal(fixture.created[0].payload.line_items[0].price_data.unit_amount, 12500);
  assert.equal(fixture.created[0].payload.metadata.order_id, REQUEST.order_id);
});

test('reuses an existing open Stripe session', async () => {
  const fixture = createFixture({ existingSession: true });
  const result = await fixture.service.createCheckout(REQUEST, '33333333-3333-4333-8333-333333333333');

  assert.equal(result.checkout.url, 'https://checkout.stripe.test/session');
  assert.equal(fixture.created.length, 0);
  assert.equal(fixture.retrieved.length, 1);
});

test('Stripe creation failure persists failed state and exposes STRIPE_UNAVAILABLE', async () => {
  const fixture = createFixture({ stripeFailure: true });
  await assert.rejects(
    fixture.service.createCheckout(REQUEST, '33333333-3333-4333-8333-333333333333'),
    (error) => error.status === 503 && error.details.code === 'STRIPE_UNAVAILABLE',
  );
  assert.equal(fixture.failed, 1);
});

test('ambiguous Stripe connection failure remains pending for idempotent recovery', async () => {
  const fixture = createFixture({ ambiguousStripeFailure: true });
  await assert.rejects(
    fixture.service.createCheckout(REQUEST, '33333333-3333-4333-8333-333333333333'),
    (error) => error.status === 503 && error.details.code === 'CHECKOUT_IN_PROGRESS',
  );
  assert.equal(fixture.failed, 0);
});

test('does not cancel a pending payment whose Stripe Session outcome is unknown', async () => {
  const fixture = createFixture();
  await assert.rejects(
    fixture.service.expireCheckout(REQUEST.order_id, '33333333-3333-4333-8333-333333333333'),
    (error) => error.status === 503 && error.details.code === 'CHECKOUT_IN_PROGRESS',
  );
  assert.equal(fixture.cancelled, 0);
});

test('expires a persisted open Session before marking its payment cancelled', async () => {
  const fixture = createFixture({ existingSession: true });
  const result = await fixture.service.expireCheckout(
    REQUEST.order_id,
    '33333333-3333-4333-8333-333333333333',
  );

  assert.equal(fixture.expired.length, 1);
  assert.equal(fixture.cancelled, 1);
  assert.equal(result.payment.status, 'cancelled');
  assert.equal(result.checkout.status, 'expired');
});

function createFixture({
  existingSession = false,
  stripeFailure = false,
  ambiguousStripeFailure = false,
} = {}) {
  const created = [];
  const retrieved = [];
  const expired = [];
  let failed = 0;
  let cancelled = 0;
  const payment = {
    id: 'payment-1',
    order_id: REQUEST.order_id,
    buyer_id: REQUEST.buyer_id,
    status: 'pending',
    amount_cents: REQUEST.amount_cents,
    currency: REQUEST.currency,
    stripe_checkout_session_id: existingSession ? 'cs_test' : null,
  };
  const payments = {
    createOrGet: async () => payment,
    getByOrder: async () => payment,
    saveSession: async (orderId, session) => ({
      ...payment,
      stripe_checkout_session_id: session.id,
      stripe_checkout_url: session.url,
    }),
    markCreationFailed: async () => { failed += 1; },
    markCancelled: async () => {
      cancelled += 1;
      return { ...payment, status: 'cancelled' };
    },
  };
  const session = {
    id: 'cs_test', url: 'https://checkout.stripe.test/session', status: 'open', expires_at: 1893456000,
  };
  const stripe = {
    checkout: { sessions: {
      async create(payload, options) {
        created.push({ payload, options });
        if (ambiguousStripeFailure) {
          const error = new Error('network error');
          error.type = 'StripeConnectionError';
          throw error;
        }
        if (stripeFailure) {
          const error = new Error('invalid request');
          error.type = 'StripeInvalidRequestError';
          throw error;
        }
        return session;
      },
      async retrieve(id) { retrieved.push(id); return session; },
      async expire(id) {
        expired.push(id);
        return { ...session, status: 'expired', url: null };
      },
    } },
  };
  return {
    created,
    retrieved,
    expired,
    get failed() { return failed; },
    get cancelled() { return cancelled; },
    service: createPaymentCheckoutService({
      payments, stripeProvider: () => stripe, clientOrigin: 'http://localhost:5173',
    }),
  };
}
