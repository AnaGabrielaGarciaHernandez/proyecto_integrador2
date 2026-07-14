const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { EVENT_TYPES, EventEnvelopeSchema } = require('../src');

test('accepts a versioned EcoBazar event envelope', () => {
  const id = randomUUID();
  const parsed = EventEnvelopeSchema.parse({
    event_id: id,
    event_type: EVENT_TYPES.ORDER_PAID,
    event_version: 1,
    producer: 'order-service',
    occurred_at: new Date().toISOString(),
    correlation_id: randomUUID(),
    causation_id: null,
    payload: { order_id: randomUUID() },
  });
  assert.equal(parsed.event_id, id);
});
