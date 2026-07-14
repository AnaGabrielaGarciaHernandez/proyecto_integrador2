const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { EVENT_TYPES } = require('@ecobazar/contracts');
const {
  createEvent,
  insertOutbox,
  startOutboxWorker,
  startConsumer,
} = require('../src');

test('insertOutbox writes the complete event through the caller transaction', async () => {
  const event = createEvent({
    eventType: EVENT_TYPES.ORDER_CANCELLED,
    producer: 'order-service',
    correlationId: randomUUID(),
    payload: { order_id: randomUUID() },
  });
  let statement;
  const client = {
    async query(sql, params) {
      statement = { sql, params };
      return { rows: [] };
    },
  };

  await insertOutbox(client, event);

  assert.match(statement.sql, /INSERT INTO message_outbox/);
  assert.equal(statement.params[0], event.event_id);
  assert.deepEqual(JSON.parse(statement.params[4]), event);
});

test('outbox worker publishes and marks an event after broker confirmation', async () => {
  const event = createEvent({
    eventType: EVENT_TYPES.ORDER_PAID,
    producer: 'order-service',
    correlationId: randomUUID(),
    payload: { order_id: randomUUID() },
  });
  let published;
  let updated = false;
  let release;
  const done = new Promise((resolve) => { release = resolve; });
  const db = {
    transaction: async (work) => work({
      query: async (sql) => {
        if (sql.includes('SELECT event_id')) {
          return updated ? { rows: [] } : { rows: [{
            event_id: event.event_id,
            event_type: event.event_type,
            correlation_id: event.correlation_id,
            payload: event,
            attempts: 0,
          }] };
        }
        if (sql.includes('processed_at = now()')) {
          updated = true;
          release();
        }
        return { rows: [] };
      },
    }),
  };
  const bus = { publish: async (key, value) => { published = { key, value }; } };
  const stop = startOutboxWorker({ db, bus, serviceName: 'test', intervalMs: 5 });
  await done;
  await stop();
  assert.equal(published.key, EVENT_TYPES.ORDER_PAID);
  assert.equal(published.value.event_id, event.event_id);
  assert.equal(updated, true);
});

test('outbox failure leaves the row pending and a later tick recovers it', async () => {
  const event = createEvent({
    eventType: EVENT_TYPES.ORDER_PAID,
    producer: 'order-service',
    correlationId: randomUUID(),
    payload: { order_id: randomUUID() },
  });
  let attempts = 0;
  let processed = false;
  let publishCalls = 0;
  let resolveDone;
  const done = new Promise((resolve) => { resolveDone = resolve; });
  const db = {
    transaction: async (work) => work({
      async query(sql) {
        if (sql.includes('SELECT event_id')) {
          return processed ? { rows: [] } : { rows: [{
            event_id: event.event_id,
            event_type: event.event_type,
            correlation_id: event.correlation_id,
            payload: event,
            attempts,
          }] };
        }
        if (sql.includes('attempts = attempts + 1')) attempts += 1;
        if (sql.includes('processed_at = now()')) {
          processed = true;
          resolveDone();
        }
        return { rows: [] };
      },
    }),
  };
  const bus = {
    async publish() {
      publishCalls += 1;
      if (publishCalls === 1) throw new Error('Rabbit unavailable');
    },
  };
  const originalError = console.error;
  console.error = () => {};
  const stop = startOutboxWorker({ db, bus, serviceName: 'test', intervalMs: 5 });
  try {
    await done;
    await stop();
  } finally {
    console.error = originalError;
  }
  assert.equal(attempts, 1);
  assert.equal(publishCalls, 2);
  assert.equal(processed, true);
});

test('inbox handles an event once and acknowledges duplicates', async () => {
  let delivery;
  let inboxExists = false;
  let handled = 0;
  let acknowledgements = 0;
  const channel = {
    consume: async (queue, callback) => { delivery = callback; return { consumerTag: 'tag-1' }; },
    ack: () => { acknowledgements += 1; },
    nack: () => {},
    cancel: async () => {},
  };
  const bus = {
    setupConsumer: async () => ({ channel, dlq: 'test.dlq' }),
    publishToQueue: async () => {},
  };
  const db = {
    transaction: async (work) => work({
      query: async (sql) => {
        if (sql.includes('INSERT INTO message_inbox')) {
          if (inboxExists) return { rows: [] };
          inboxExists = true;
          return { rows: [{ event_id: 'new' }] };
        }
        return { rows: [] };
      },
    }),
  };
  await startConsumer({
    db, bus, serviceName: 'test', queue: 'test.queue', bindings: [EVENT_TYPES.ORDER_PAID],
    handler: async () => { handled += 1; },
  });
  const event = createEvent({
    eventType: EVENT_TYPES.ORDER_PAID,
    producer: 'order-service',
    correlationId: randomUUID(),
    payload: { order_id: randomUUID() },
  });
  const message = {
    content: Buffer.from(JSON.stringify(event)),
    properties: { headers: {}, correlationId: event.correlation_id, messageId: event.event_id },
    fields: { routingKey: event.event_type },
  };
  await delivery(message);
  await delivery(message);
  assert.equal(handled, 1);
  assert.equal(acknowledgements, 2);
});

test('consumer sends a repeatedly failing message to its DLQ after five retries', async () => {
  let delivery;
  const published = [];
  let acknowledgements = 0;
  const channel = {
    consume: async (queue, callback) => { delivery = callback; return { consumerTag: 'tag-2' }; },
    ack: () => { acknowledgements += 1; },
    nack: () => {},
    cancel: async () => {},
  };
  const bus = {
    setupConsumer: async () => ({ channel, dlq: 'test.queue.dlq' }),
    publishToQueue: async (queue) => { published.push(queue); },
  };
  const db = {
    transaction: async (work) => work({
      query: async () => ({ rows: [{ event_id: 'new' }] }),
    }),
  };
  await startConsumer({
    db, bus, serviceName: 'test', queue: 'test.queue', bindings: [EVENT_TYPES.ORDER_PAID],
    handler: async () => { throw new Error('handler failed'); },
  });
  const event = createEvent({
    eventType: EVENT_TYPES.ORDER_PAID,
    producer: 'order-service',
    correlationId: randomUUID(),
    payload: { order_id: randomUUID() },
  });
  await delivery({
    content: Buffer.from(JSON.stringify(event)),
    properties: {
      headers: { 'x-retry-count': 5 },
      correlationId: event.correlation_id,
      messageId: event.event_id,
    },
    fields: { routingKey: event.event_type },
  });
  assert.deepEqual(published, ['test.queue.dlq']);
  assert.equal(acknowledgements, 1);
});

test('consumer preserves correlation metadata when immediately republishing a failure', async () => {
  let delivery;
  let acknowledged = false;
  let republished;
  const channel = {
    consume: async (queue, callback) => { delivery = callback; return { consumerTag: 'tag-3' }; },
    ack: () => { acknowledged = true; },
    nack: () => {},
    cancel: async () => {},
  };
  const bus = {
    setupConsumer: async () => ({ channel, dlq: 'test.queue.dlq' }),
    publishToQueue: async (queue, content, options) => { republished = { queue, content, options }; },
  };
  const db = {
    transaction: async (work) => work({ query: async () => ({ rows: [{ event_id: 'new' }] }) }),
  };
  await startConsumer({
    db,
    bus,
    serviceName: 'test',
    queue: 'test.queue',
    bindings: [EVENT_TYPES.ORDER_PAID],
    handler: async () => { throw new Error('temporary failure'); },
  });
  const event = createEvent({
    eventType: EVENT_TYPES.ORDER_PAID,
    producer: 'order-service',
    correlationId: randomUUID(),
    payload: { order_id: randomUUID() },
  });
  const originalError = console.error;
  console.error = () => {};
  try {
    await delivery({
      content: Buffer.from(JSON.stringify(event)),
      properties: {
        headers: { 'x-retry-count': 2 },
        correlationId: event.correlation_id,
        messageId: event.event_id,
      },
      fields: { routingKey: event.event_type },
    });
  } finally {
    console.error = originalError;
  }
  assert.equal(republished.queue, 'test.queue');
  assert.equal(republished.options.correlationId, event.correlation_id);
  assert.equal(republished.options.headers['x-retry-count'], 3);
  assert.equal(acknowledged, true);
});

test('consumer performs five direct retries before the sixth failed delivery reaches DLQ', async () => {
  let delivery;
  const publications = [];
  let acknowledgements = 0;
  let handlerCalls = 0;
  const channel = {
    consume: async (queue, callback) => { delivery = callback; return { consumerTag: 'tag-4' }; },
    ack: () => { acknowledgements += 1; },
    nack: () => {},
    cancel: async () => {},
  };
  const bus = {
    setupConsumer: async () => ({ channel, dlq: 'test.queue.dlq' }),
    publishToQueue: async (queue, content, options) => {
      publications.push({ queue, content, options });
    },
  };
  const db = {
    transaction: async (work) => work({ query: async () => ({ rows: [{ event_id: 'new' }] }) }),
  };
  await startConsumer({
    db,
    bus,
    serviceName: 'test',
    queue: 'test.queue',
    bindings: [EVENT_TYPES.ORDER_PAID],
    handler: async () => { handlerCalls += 1; throw new Error('always fails'); },
    maxRetries: 5,
  });
  const event = createEvent({
    eventType: EVENT_TYPES.ORDER_PAID,
    producer: 'order-service',
    correlationId: randomUUID(),
    payload: { order_id: randomUUID() },
  });
  let message = {
    content: Buffer.from(JSON.stringify(event)),
    properties: {
      headers: { 'x-retry-count': 0 },
      correlationId: event.correlation_id,
      messageId: event.event_id,
    },
    fields: { routingKey: event.event_type },
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    for (let deliveryNumber = 0; deliveryNumber < 6; deliveryNumber += 1) {
      await delivery(message);
      const publication = publications.at(-1);
      if (publication.queue === 'test.queue') {
        message = {
          content: publication.content,
          properties: {
            headers: publication.options.headers,
            correlationId: publication.options.correlationId,
            messageId: publication.options.messageId,
          },
          fields: { routingKey: event.event_type },
        };
      }
    }
  } finally {
    console.error = originalError;
  }
  assert.equal(handlerCalls, 6);
  assert.equal(publications.filter(({ queue }) => queue === 'test.queue').length, 5);
  assert.equal(publications.at(-1).queue, 'test.queue.dlq');
  assert.equal(acknowledgements, 6);
});

test('handler rollback does not retain Inbox and the retry can process successfully', async () => {
  let delivery;
  let republished;
  let handlerCalls = 0;
  const committedInbox = new Set();
  const channel = {
    consume: async (queue, callback) => { delivery = callback; return { consumerTag: 'tag-5' }; },
    ack: () => {},
    nack: () => {},
    cancel: async () => {},
  };
  const bus = {
    setupConsumer: async () => ({ channel, dlq: 'test.queue.dlq' }),
    publishToQueue: async (queue, content, options) => { republished = { queue, content, options }; },
  };
  const db = {
    async transaction(work) {
      const pending = [];
      const client = {
        async query(sql, params) {
          if (sql.includes('INSERT INTO message_inbox')) {
            if (committedInbox.has(params[0])) return { rows: [] };
            pending.push(params[0]);
            return { rows: [{ event_id: params[0] }] };
          }
          return { rows: [] };
        },
      };
      const result = await work(client);
      for (const id of pending) committedInbox.add(id);
      return result;
    },
  };
  await startConsumer({
    db,
    bus,
    serviceName: 'test',
    queue: 'test.queue',
    bindings: [EVENT_TYPES.ORDER_PAID],
    handler: async () => {
      handlerCalls += 1;
      if (handlerCalls === 1) throw new Error('transaction rolls back');
    },
  });
  const event = createEvent({
    eventType: EVENT_TYPES.ORDER_PAID,
    producer: 'order-service',
    correlationId: randomUUID(),
    payload: { order_id: randomUUID() },
  });
  const first = {
    content: Buffer.from(JSON.stringify(event)),
    properties: { headers: {}, correlationId: event.correlation_id, messageId: event.event_id },
    fields: { routingKey: event.event_type },
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    await delivery(first);
    assert.equal(committedInbox.has(event.event_id), false);
    await delivery({
      content: republished.content,
      properties: {
        headers: republished.options.headers,
        correlationId: republished.options.correlationId,
        messageId: republished.options.messageId,
      },
      fields: { routingKey: event.event_type },
    });
  } finally {
    console.error = originalError;
  }
  assert.equal(handlerCalls, 2);
  assert.equal(committedInbox.has(event.event_id), true);
});
