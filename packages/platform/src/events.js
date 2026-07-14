const { randomUUID } = require('node:crypto');
const amqp = require('amqplib');
const { EventEnvelopeSchema } = require('@ecobazar/contracts');

const EVENTS_EXCHANGE = 'ecobazar.events';
const DLX_EXCHANGE = 'ecobazar.dlx';

function createEvent({ eventType, producer, correlationId, causationId = null, payload }) {
  return EventEnvelopeSchema.parse({
    event_id: randomUUID(),
    event_type: eventType,
    event_version: 1,
    producer,
    occurred_at: new Date().toISOString(),
    correlation_id: correlationId,
    causation_id: causationId,
    payload,
  });
}

async function insertOutbox(client, event) {
  const parsed = EventEnvelopeSchema.parse(event);
  await client.query(
    `INSERT INTO message_outbox
       (event_id, event_type, event_version, correlation_id, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [parsed.event_id, parsed.event_type, parsed.event_version,
      parsed.correlation_id, JSON.stringify(parsed)],
  );
  return parsed;
}

function createRabbitBus({ url, serviceName }) {
  let connection;
  let publishChannel;
  let consumeChannel;
  let closing = false;

  async function connect() {
    if (connection) return;
    connection = await amqp.connect(url);
    connection.on('error', (error) => console.error(`[${serviceName}] step=rabbit_connection_error`, error));
    connection.on('close', () => {
      connection = undefined;
      publishChannel = undefined;
      consumeChannel = undefined;
      if (!closing) {
        console.error(`[${serviceName}] step=rabbit_connection_closed unexpected=true`);
        // amqplib does not restore consumers after a connection is lost. A clean
        // process restart is the smallest reliable recovery mechanism in Compose:
        // Outbox rows remain pending and Inbox keeps handlers idempotent.
        process.exitCode = 1;
        setImmediate(() => process.exit(1));
      }
    });
    publishChannel = await connection.createConfirmChannel();
    consumeChannel = await connection.createChannel();
    await Promise.all([
      publishChannel.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true }),
      publishChannel.assertExchange(DLX_EXCHANGE, 'direct', { durable: true }),
      consumeChannel.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true }),
      consumeChannel.assertExchange(DLX_EXCHANGE, 'direct', { durable: true }),
    ]);
    console.log(`[${serviceName}] step=rabbit_connected`);
  }

  async function publish(routingKey, event, options = {}) {
    await connect();
    const content = Buffer.from(JSON.stringify(event));
    publishChannel.publish(EVENTS_EXCHANGE, routingKey, content, {
      persistent: true,
      contentType: 'application/json',
      messageId: event.event_id,
      correlationId: event.correlation_id,
      headers: { 'x-retry-count': 0, ...(options.headers || {}) },
    });
    await publishChannel.waitForConfirms();
  }

  async function publishToQueue(queue, content, options = {}) {
    await connect();
    publishChannel.sendToQueue(queue, content, { persistent: true, ...options });
    await publishChannel.waitForConfirms();
  }

  async function setupConsumer(queue, bindings) {
    await connect();
    const dlq = `${queue}.dlq`;
    await consumeChannel.assertQueue(dlq, { durable: true });
    await consumeChannel.bindQueue(dlq, DLX_EXCHANGE, queue);
    await consumeChannel.assertQueue(queue, {
      durable: true,
      deadLetterExchange: DLX_EXCHANGE,
      deadLetterRoutingKey: queue,
    });
    for (const binding of bindings) {
      await consumeChannel.bindQueue(queue, EVENTS_EXCHANGE, binding);
    }
    await consumeChannel.prefetch(10);
    return { channel: consumeChannel, dlq };
  }

  async function close() {
    closing = true;
    await consumeChannel?.close().catch(() => {});
    await publishChannel?.close().catch(() => {});
    await connection?.close().catch(() => {});
  }

  return { connect, publish, publishToQueue, setupConsumer, close };
}

function startOutboxWorker({ db, bus, serviceName, intervalMs = 1000, batchSize = 20 }) {
  let running = false;
  let stopped = false;

  async function tick() {
    if (running || stopped) return;
    running = true;
    try {
      await db.transaction(async (client) => {
        const result = await client.query(
          `SELECT event_id, event_type, correlation_id, payload, attempts
           FROM message_outbox
           WHERE processed_at IS NULL
           ORDER BY created_at
           FOR UPDATE SKIP LOCKED
           LIMIT $1`,
          [batchSize],
        );
        for (const row of result.rows) {
          const event = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
          try {
            await bus.publish(row.event_type, event);
            await client.query('UPDATE message_outbox SET processed_at = now(), last_error = NULL WHERE event_id = $1', [row.event_id]);
            console.log(`[${serviceName}] correlation_id=${row.correlation_id} event_type=${row.event_type} step=outbox_published`);
          } catch (error) {
            await client.query(
              'UPDATE message_outbox SET attempts = attempts + 1, last_error = $2 WHERE event_id = $1',
              [row.event_id, error.message],
            );
            console.error(`[${serviceName}] correlation_id=${row.correlation_id} event_type=${row.event_type} step=outbox_publish_failed`, error);
          }
        }
      });
    } catch (error) {
      console.error(`[${serviceName}] step=outbox_worker_failed`, error);
    } finally {
      running = false;
    }
  }

  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  tick();
  return async () => {
    stopped = true;
    clearInterval(timer);
    while (running) await new Promise((resolve) => setTimeout(resolve, 10));
  };
}

async function startConsumer({ db, bus, serviceName, queue, bindings, handler, maxRetries = 5 }) {
  const { channel, dlq } = await bus.setupConsumer(queue, bindings);
  const consumer = await channel.consume(queue, async (message) => {
    if (!message) return;
    let event;
    try {
      event = EventEnvelopeSchema.parse(JSON.parse(message.content.toString('utf8')));
      const processed = await db.transaction(async (client) => {
        const inbox = await client.query(
          `INSERT INTO message_inbox (event_id, event_type, correlation_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (event_id) DO NOTHING
           RETURNING event_id`,
          [event.event_id, event.event_type, event.correlation_id],
        );
        if (!inbox.rows[0]) return false;
        await handler({ event, client });
        return true;
      });
      console.log(`[${serviceName}] correlation_id=${event.correlation_id} event_type=${event.event_type} step=${processed ? 'inbox_processed' : 'inbox_duplicate'}`);
      channel.ack(message);
    } catch (error) {
      const retries = Number(message.properties.headers?.['x-retry-count'] || 0);
      const correlationId = event?.correlation_id || message.properties.correlationId || 'unknown';
      const eventType = event?.event_type || message.fields.routingKey || 'unknown';
      try {
        if (retries < maxRetries) {
          await bus.publishToQueue(queue, message.content, {
            contentType: 'application/json',
            messageId: message.properties.messageId,
            correlationId,
            headers: { ...message.properties.headers, 'x-retry-count': retries + 1 },
          });
          console.error(`[${serviceName}] correlation_id=${correlationId} event_type=${eventType} retry=${retries + 1} step=inbox_retry`, error);
        } else {
          await bus.publishToQueue(dlq, message.content, {
            contentType: 'application/json',
            correlationId,
            headers: message.properties.headers,
          });
          console.error(`[${serviceName}] correlation_id=${correlationId} event_type=${eventType} sent_to_dlq=true`, error);
        }
        channel.ack(message);
      } catch (publishError) {
        console.error(`[${serviceName}] correlation_id=${correlationId} event_type=${eventType} step=retry_publish_failed`, publishError);
        channel.nack(message, false, true);
      }
    }
  }, { noAck: false });
  return async () => channel.cancel(consumer.consumerTag).catch(() => {});
}

module.exports = {
  createEvent,
  insertOutbox,
  createRabbitBus,
  startOutboxWorker,
  startConsumer,
};
