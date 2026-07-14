const test = require('node:test');
const assert = require('node:assert/strict');
const { createEvent } = require('../src');
const { EVENT_TYPES } = require('@ecobazar/contracts');

test('creates event envelopes with correlation metadata', () => {
  const correlationId = '11111111-1111-4111-8111-111111111111';
  const event = createEvent({
    eventType: EVENT_TYPES.ORDER_CANCELLED,
    producer: 'order-service',
    correlationId,
    payload: { order_id: '22222222-2222-4222-8222-222222222222' },
  });
  assert.equal(event.correlation_id, correlationId);
  assert.equal(event.event_version, 1);
});
