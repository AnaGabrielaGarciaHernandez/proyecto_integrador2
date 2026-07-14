const test = require('node:test');
const assert = require('node:assert/strict');
const { startCompensationWorker } = require('../src/workers/compensation');

test('worker recovers an interrupted compensating saga on its next tick', async () => {
  const saga = {
    id: '11111111-1111-4111-8111-111111111111',
    correlation_id: '22222222-2222-4222-8222-222222222222',
    last_error: 'Catalog was offline',
  };
  let calls = 0;
  let resolveDone;
  const done = new Promise((resolve) => { resolveDone = resolve; });
  const orders = {
    async listExpiredPendingCheckouts() { return []; },
    async listPendingCompensations() { return calls === 0 ? [saga] : []; },
  };
  const checkoutService = {
    async compensate(orderId, input) {
      calls += 1;
      assert.equal(orderId, saga.id);
      assert.equal(input.correlationId, saga.correlation_id);
      resolveDone();
    },
  };
  const stop = startCompensationWorker({ orders, checkoutService, intervalMs: 5 });
  await done;
  await stop();
  assert.equal(calls, 1);
});
