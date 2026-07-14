const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const EVENT_TYPES = {
  PAYMENT_COMPLETED: 'payment.checkout.completed.v1',
  PAYMENT_FAILED: 'payment.checkout.failed.v1',
  PAYMENT_EXPIRED: 'payment.checkout.expired.v1',
  PAYMENT_CANCELLED: 'payment.checkout.cancelled.v1',
  ORDER_PAID: 'order.paid.v1',
  ORDER_CANCELLED: 'order.cancelled.v1',
};
const outbox = [];
const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === '@ecobazar/contracts') return { EVENT_TYPES };
  if (request === '@ecobazar/platform') {
    return {
      createEvent(input) {
        return {
          event_id: `${input.eventType}-id`,
          event_type: input.eventType,
          correlation_id: input.correlationId,
          payload: input.payload,
        };
      },
      async insertOutbox(client, event) {
        void client;
        outbox.push(event);
      },
    };
  }
  return originalLoad(request, parent, isMain);
};
const { createPaymentEventHandler } = require('../src/services/paymentEvents');
Module._load = originalLoad;

const ORDER = {
  id: '11111111-1111-4111-8111-111111111111',
  buyer_id: '22222222-2222-4222-8222-222222222222',
  status: 'pending_payment',
  items: [{ variant_id: '33333333-3333-4333-8333-333333333333', quantity: 1 }],
};

test.beforeEach(() => { outbox.length = 0; });

test('completed payment transitions the order and emits order.paid', async () => {
  const orders = {
    async transitionPaid() { return { order: { ...ORDER, status: 'paid' }, transitioned: true }; },
  };
  const handler = createPaymentEventHandler({ orders, catalogClient: {} });
  await handler({ event: event(EVENT_TYPES.PAYMENT_COMPLETED), client: {} });

  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].event_type, EVENT_TYPES.ORDER_PAID);
  assert.deepEqual(outbox[0].payload.items, ORDER.items);
});

test('expired payment releases inventory and emits order.cancelled', async () => {
  let staged = 0;
  let released = 0;
  const cancelled = { ...ORDER, status: 'cancelled' };
  const orders = {
    async getSagaOrder() { return staged > 0 ? cancelled : ORDER; },
    async stageCompensation() { staged += 1; },
    async finishCompensation() { return { transitioned: true }; },
  };
  const catalogClient = {
    async release(orderId) { released += 1; return { order_id: orderId, status: 'released' }; },
  };
  const handler = createPaymentEventHandler({ orders, catalogClient });
  await handler({ event: event(EVENT_TYPES.PAYMENT_EXPIRED), client: { query: async () => {} } });

  assert.equal(staged, 1);
  assert.equal(released, 1);
  assert.equal(outbox[0].event_type, EVENT_TYPES.ORDER_CANCELLED);
});

test('Catalog outage leaves a durable compensation_pending state for the worker', async () => {
  const queries = [];
  const orders = {
    async getSagaOrder() { return ORDER; },
    async stageCompensation() {},
  };
  const handler = createPaymentEventHandler({
    orders,
    catalogClient: { async release() { throw new Error('Catalog offline'); } },
  });
  await handler({
    event: event(EVENT_TYPES.PAYMENT_FAILED),
    client: { async query(sql, params) { queries.push({ sql, params }); } },
  });

  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /status = 'compensation_pending'/);
  assert.equal(outbox.length, 0);
});

function event(type) {
  return {
    event_id: '44444444-4444-4444-8444-444444444444',
    event_type: type,
    correlation_id: '55555555-5555-4555-8555-555555555555',
    payload: { order_id: ORDER.id, buyer_id: ORDER.buyer_id },
  };
}
