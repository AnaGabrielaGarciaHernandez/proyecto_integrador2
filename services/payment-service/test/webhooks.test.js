const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === '@ecobazar/platform') {
    return {
      createHttpError(message, status, details) {
        return Object.assign(new Error(message), { status, details });
      },
    };
  }
  return originalLoad(request, parent, isMain);
};
const { createWebhookService } = require('../src/services/webhooks');
Module._load = originalLoad;

test('webhook rejects missing and invalid signatures', () => {
  const missing = createWebhookService({
    payments: {},
    webhookSecret: 'whsec_test',
    stripeProvider: () => ({ webhooks: { constructEvent() {} } }),
  });
  assert.throws(
    () => missing.constructEvent(Buffer.from('{}'), ''),
    (error) => error.status === 400 && error.details.code === 'INVALID_SIGNATURE',
  );

  const invalid = createWebhookService({
    payments: {},
    webhookSecret: 'whsec_test',
    stripeProvider: () => ({ webhooks: { constructEvent() { throw new Error('bad'); } } }),
  });
  assert.throws(
    () => invalid.constructEvent(Buffer.from('{}'), 'bad'),
    (error) => error.status === 400 && error.details.code === 'INVALID_SIGNATURE',
  );
});

test('duplicate Stripe events are delegated to the idempotent repository once per delivery', async () => {
  let calls = 0;
  const service = createWebhookService({
    webhookSecret: 'whsec_test',
    stripeProvider: () => ({}),
    payments: {
      async processStripeEvent() {
        calls += 1;
        return { duplicate: calls > 1, processed: calls === 1 };
      },
    },
  });
  const event = {
    id: 'evt_test',
    type: 'checkout.session.expired',
    data: { object: { metadata: { order_id: 'order-1' } } },
  };
  const first = await service.processEvent(event);
  const second = await service.processEvent(event);
  assert.equal(first.processed, true);
  assert.equal(second.duplicate, true);
});
