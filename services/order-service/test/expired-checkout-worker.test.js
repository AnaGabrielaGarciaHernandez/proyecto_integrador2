const test = require('node:test');
const assert = require('node:assert/strict');

const {
  reconcileExpiredCheckouts,
  isConfirmedWithoutCharge,
} = require('../src/workers/compensation');

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const CORRELATION_ID = '22222222-2222-4222-8222-222222222222';

test('expired cancelable Payment is reconciled before inventory compensation', async () => {
  const fixture = createFixture({
    paymentResponse: {
      payment: { status: 'cancelled' },
      checkout: { status: 'expired' },
    },
  });

  await reconcileExpiredCheckouts(fixture);

  assert.deepEqual(fixture.calls, ['payment.expire', 'checkout.compensate']);
  assert.equal(fixture.compensations[0].orderId, ORDER_ID);
  assert.equal(fixture.compensations[0].options.paymentStatus, 'cancelled');
});

test('Payment transport outage preserves the reservation for a later retry', async () => {
  const outage = Object.assign(new Error('Payment offline'), {
    status: 503,
    details: { code: 'DEPENDENCY_UNAVAILABLE' },
  });
  const fixture = createFixture({ paymentErrors: [outage] });

  await withMutedConsoleError(() => reconcileExpiredCheckouts(fixture));

  assert.deepEqual(fixture.calls, ['payment.expire']);
  assert.equal(fixture.compensations.length, 0);
});

test('reconciliation never expires or compensates an order that became paid', async () => {
  const fixture = createFixture({
    currentOrder: { status: 'paid', saga_status: 'paid' },
  });

  await reconcileExpiredCheckouts(fixture);

  assert.deepEqual(fixture.calls, []);
  assert.equal(fixture.compensations.length, 0);
});

test('next interval recovers after Payment returns from an outage', async () => {
  const outage = Object.assign(new Error('timeout'), { status: 503 });
  const fixture = createFixture({
    paymentErrors: [outage],
    paymentResponse: {
      payment: { status: 'cancelled' },
      checkout: { status: 'expired' },
    },
  });

  await withMutedConsoleError(() => reconcileExpiredCheckouts(fixture));
  assert.equal(fixture.compensations.length, 0);

  await reconcileExpiredCheckouts(fixture);
  assert.deepEqual(fixture.calls, [
    'payment.expire',
    'payment.expire',
    'checkout.compensate',
  ]);
  assert.equal(fixture.compensations.length, 1);
});

test('Payment 404 after session creation remains ambiguous and preserves stock', async () => {
  const fixture = createFixture({
    paymentErrors: [Object.assign(new Error('Payment not found'), { status: 404 })],
  });

  await withMutedConsoleError(() => reconcileExpiredCheckouts(fixture));

  assert.deepEqual(fixture.calls, ['payment.expire']);
  assert.equal(fixture.compensations.length, 0);
});

test('inventory_reserved recovers the idempotent Stripe session before expiring it', async () => {
  const fixture = createFixture({
    currentOrder: { saga_status: 'inventory_reserved' },
    paymentCreateResponse: {
      payment: { status: 'pending' },
      checkout: { status: 'open', session_id: 'cs_recovered' },
    },
    paymentResponse: {
      payment: { status: 'cancelled' },
      checkout: { status: 'expired' },
    },
  });

  await reconcileExpiredCheckouts(fixture);

  assert.deepEqual(fixture.calls, [
    'payment.create',
    'payment.expire',
    'checkout.compensate',
  ]);
  assert.equal(fixture.paymentRequests[0].request.order_id, ORDER_ID);
  assert.equal(fixture.paymentRequests[0].correlationId, CORRELATION_ID);
});

test('ambiguous recovery of inventory_reserved retains inventory', async () => {
  const fixture = createFixture({
    currentOrder: { saga_status: 'inventory_reserved' },
    paymentCreateErrors: [Object.assign(new Error('timeout'), { status: 503 })],
  });

  await withMutedConsoleError(() => reconcileExpiredCheckouts(fixture));

  assert.deepEqual(fixture.calls, ['payment.create']);
  assert.equal(fixture.compensations.length, 0);
});

test('recovered expired session is reconciled in Payment before Catalog release', async () => {
  const fixture = createFixture({
    currentOrder: { saga_status: 'inventory_reserved' },
    paymentCreateResponse: {
      payment: { status: 'pending' },
      checkout: { status: 'expired', session_id: 'cs_recovered' },
    },
    paymentResponse: {
      payment: { status: 'cancelled' },
      checkout: { status: 'expired' },
    },
  });

  await reconcileExpiredCheckouts(fixture);

  assert.deepEqual(fixture.calls, [
    'payment.create',
    'payment.expire',
    'checkout.compensate',
  ]);
});

test('created saga compensates without contacting Payment', async () => {
  const fixture = createFixture({ currentOrder: { saga_status: 'created' } });

  await reconcileExpiredCheckouts(fixture);

  assert.deepEqual(fixture.calls, ['checkout.compensate']);
});

test('only terminal no-charge responses are considered safe', () => {
  assert.equal(isConfirmedWithoutCharge({ payment: { status: 'cancelled' } }), true);
  assert.equal(isConfirmedWithoutCharge({ checkout: { status: 'expired' } }), true);
  assert.equal(isConfirmedWithoutCharge({ payment: { status: 'pending' }, checkout: { status: 'open' } }), false);
  assert.equal(isConfirmedWithoutCharge({}), false);
});

function createFixture({
  currentOrder,
  paymentResponse,
  paymentErrors = [],
  paymentCreateResponse,
  paymentCreateErrors = [],
} = {}) {
  const calls = [];
  const compensations = [];
  const paymentRequests = [];
  const candidate = {
    id: ORDER_ID,
    correlation_id: CORRELATION_ID,
    saga_status: 'payment_session_created',
  };
  const order = {
    id: ORDER_ID,
    order_number: 'ECO-2026-000001',
    buyer_id: '33333333-3333-4333-8333-333333333333',
    status: 'pending_payment',
    saga_status: 'payment_session_created',
    total_cents: 12500,
    currency: 'MXN',
    checkout_expires_at: '2026-01-01T00:00:00.000Z',
    items: [{
      product_name: 'Chamarra', size_name: 'M', quantity: 1, unit_price_cents: 12500,
    }],
    ...currentOrder,
  };
  return {
    calls,
    compensations,
    paymentRequests,
    orders: {
      async listExpiredPendingCheckouts() { return [candidate]; },
      async getSagaOrder() { return order; },
    },
    paymentClient: {
      async createCheckout(request, correlationId) {
        calls.push('payment.create');
        paymentRequests.push({ request, correlationId });
        const error = paymentCreateErrors.shift();
        if (error) throw error;
        return paymentCreateResponse || {
          payment: { status: 'pending' },
          checkout: { status: 'open', session_id: 'cs_recovered' },
        };
      },
      async expire() {
        calls.push('payment.expire');
        const error = paymentErrors.shift();
        if (error) throw error;
        return paymentResponse || {
          payment: { status: 'cancelled' },
          checkout: { status: 'expired' },
        };
      },
    },
    checkoutService: {
      async compensate(orderId, options) {
        calls.push('checkout.compensate');
        compensations.push({ orderId, options });
      },
    },
  };
}

async function withMutedConsoleError(work) {
  const original = console.error;
  console.error = () => {};
  try {
    return await work();
  } finally {
    console.error = original;
  }
}
