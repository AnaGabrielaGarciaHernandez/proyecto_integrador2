const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === '@ecobazar/contracts') {
    return {
      EVENT_TYPES: { ORDER_CANCELLED: 'order.cancelled.v1' },
      PaymentCheckoutRequestSchema: { parse: (value) => value },
    };
  }
  if (request === '@ecobazar/platform') {
    return {
      createHttpError(message, status, details) {
        return Object.assign(new Error(message), { status, details });
      },
      createEvent: (value) => ({ event_id: 'event-1', event_type: value.eventType, ...value }),
      insertOutbox: async () => {},
    };
  }
  return originalLoad(request, parent, isMain);
};
const { createCheckoutService, formatCheckout } = require('../src/services/checkout');
Module._load = originalLoad;

const BUYER_ID = '11111111-1111-4111-8111-111111111111';
const ORDER_ID = '22222222-2222-4222-8222-222222222222';
const VARIANT_ID = '33333333-3333-4333-8333-333333333333';
const CORRELATION_ID = '44444444-4444-4444-8444-444444444444';

test('checkout reserves inventory and sends backend totals to Payment', async () => {
  const fixture = createFixture();
  const checkout = await fixture.service.createCheckout({ id: BUYER_ID, name: 'Lina' }, CORRELATION_ID);

  assert.equal(checkout.order_id, ORDER_ID);
  assert.equal(checkout.session_id, 'cs_test');
  assert.equal(fixture.calls.reserve.length, 1);
  assert.deepEqual(fixture.calls.reserve[0].items, [{ variant_id: VARIANT_ID, quantity: 2 }]);
  assert.equal(fixture.calls.payment[0].amount_cents, 25000);
  assert.equal(fixture.calls.payment[0].items[0].unit_price_cents, 12500);
});

test('duplicate checkout reuses the hosted session without reserving or creating it again', async () => {
  const fixture = createFixture({ existingStage: 'payment_session_created' });
  const checkout = await fixture.service.createCheckout({ id: BUYER_ID, name: 'Lina' }, CORRELATION_ID);

  assert.equal(checkout.url, 'https://checkout.stripe.test/session');
  assert.equal(fixture.calls.cart, 0);
  assert.equal(fixture.calls.reserve.length, 0);
  assert.equal(fixture.calls.payment.length, 0);
});

test('Stripe creation failure releases inventory immediately', async () => {
  const fixture = createFixture({ paymentFailure: true });
  await assert.rejects(
    fixture.service.createCheckout({ id: BUYER_ID, name: 'Lina' }, CORRELATION_ID),
    (error) => error.status === 503 && error.details.code === 'STRIPE_UNAVAILABLE',
  );
  assert.deepEqual(fixture.calls.release, [ORDER_ID]);
  assert.equal(fixture.state.compensated, true);
});

test('ambiguous Payment timeout keeps inventory reserved for safe idempotent recovery', async () => {
  const fixture = createFixture({ ambiguousPaymentFailure: true });
  const originalError = console.error;
  console.error = () => {};
  try {
    await assert.rejects(
      fixture.service.createCheckout({ id: BUYER_ID, name: 'Lina' }, CORRELATION_ID),
      (error) => error.status === 503 && error.details.code === 'CHECKOUT_IN_PROGRESS',
    );
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(fixture.calls.release, []);
  assert.equal(fixture.state.compensated, false);
  assert.equal(fixture.state.order.saga_status, 'inventory_reserved');
});

test('formatCheckout keeps the public checkout contract', () => {
  assert.deepEqual(formatCheckout(baseOrder('payment_session_created')), {
    order_id: ORDER_ID,
    order_number: 'ECO-2026-000001',
    session_id: 'cs_test',
    url: 'https://checkout.stripe.test/session',
    expires_at: '2030-01-01T00:00:00.000Z',
  });
});

function createFixture({
  existingStage = null,
  paymentFailure = false,
  ambiguousPaymentFailure = false,
} = {}) {
  const calls = { cart: 0, reserve: [], payment: [], release: [] };
  const state = { order: existingStage ? baseOrder(existingStage) : null, compensated: false };
  const db = {
    transaction: (work) => work({ query: async () => ({ rows: [] }) }),
    query: async () => ({ rows: [] }),
  };
  const orders = {
    getPendingByBuyer: async () => state.order,
    createOrGetPending: async () => {
      state.order = baseOrder('created');
      return { order: state.order, created: true };
    },
    markInventoryReserved: async () => {
      state.order = { ...state.order, saga_status: 'inventory_reserved' };
      return state.order;
    },
    saveCheckout: async (id, checkout) => {
      state.order = {
        ...state.order,
        saga_status: 'payment_session_created',
        checkout_session_id: checkout.session_id,
        checkout_url: checkout.url,
        checkout_expires_at: checkout.expires_at,
      };
      return state.order;
    },
    getSagaOrder: async () => state.order,
    stageCompensation: async () => {},
    finishCompensation: async () => {
      state.compensated = true;
      state.order = { ...state.order, status: 'cancelled', saga_status: 'compensated' };
      return { transitioned: true };
    },
  };
  const cartClient = {
    async getSnapshot() {
      calls.cart += 1;
      return { buyer_id: BUYER_ID, items: baseOrder('created').items };
    },
  };
  const catalogClient = {
    async reserve(request) {
      calls.reserve.push(request);
      return { status: 'active', items: request.items };
    },
    async release(orderId) {
      calls.release.push(orderId);
      return { status: 'released' };
    },
  };
  const paymentClient = {
    async createCheckout(request) {
      calls.payment.push(request);
      if (ambiguousPaymentFailure) {
        const error = new Error('Payment request timed out');
        error.status = 503;
        error.details = { code: 'DEPENDENCY_UNAVAILABLE' };
        throw error;
      }
      if (paymentFailure) {
        const error = new Error('Stripe unavailable');
        error.status = 503;
        error.details = { code: 'STRIPE_UNAVAILABLE' };
        throw error;
      }
      return {
        checkout: {
          session_id: 'cs_test',
          url: 'https://checkout.stripe.test/session',
          status: 'open',
          expires_at: '2030-01-01T00:00:00.000Z',
        },
      };
    },
  };
  return {
    calls,
    state,
    service: createCheckoutService({ db, orders, cartClient, catalogClient, paymentClient }),
  };
}

function baseOrder(stage) {
  return {
    id: ORDER_ID,
    order_number: 'ECO-2026-000001',
    buyer_id: BUYER_ID,
    status: 'pending_payment',
    saga_status: stage,
    correlation_id: CORRELATION_ID,
    total_cents: 25000,
    currency: 'MXN',
    checkout_session_id: stage === 'payment_session_created' ? 'cs_test' : null,
    checkout_url: stage === 'payment_session_created' ? 'https://checkout.stripe.test/session' : null,
    checkout_expires_at: '2030-01-01T00:00:00.000Z',
    items: [{
      variant_id: VARIANT_ID,
      product_id: '55555555-5555-4555-8555-555555555555',
      seller_id: '66666666-6666-4666-8666-666666666666',
      seller_user_id: '77777777-7777-4777-8777-777777777777',
      product_name: 'Chamarra circular',
      size_name: 'M',
      quantity: 2,
      unit_price_cents: 12500,
      currency: 'MXN',
    }],
  };
}
