const { EVENT_TYPES } = require('@ecobazar/contracts');
const {
  createDb,
  createRabbitBus,
  startOutboxWorker,
  startConsumer,
} = require('@ecobazar/platform');
const { loadConfig } = require('./config');
const { createApp } = require('./app');
const { createCartEventHandler } = require('./events/handlers');

async function main() {
  const config = loadConfig();
  const db = createDb({ connectionString: config.DATABASE_URL, schema: 'cart' });
  const bus = createRabbitBus({ url: config.RABBITMQ_URL, serviceName: 'cart-service' });

  await db.health();
  await bus.connect();
  const stopOutbox = startOutboxWorker({
    db,
    bus,
    serviceName: 'cart-service',
    intervalMs: config.OUTBOX_INTERVAL_MS,
  });
  const stopConsumer = await startConsumer({
    db,
    bus,
    serviceName: 'cart-service',
    queue: 'cart-service.events',
    bindings: [
      EVENT_TYPES.USER_REGISTERED,
      EVENT_TYPES.USER_ROLE_CHANGED,
      EVENT_TYPES.ORDER_PAID,
    ],
    handler: createCartEventHandler(),
    maxRetries: 5,
  });

  const app = createApp({ db, config });
  const server = app.listen(config.PORT, () => {
    console.log(`[cart-service] port=${config.PORT} step=server_started`);
  });

  let stopping = false;
  async function shutdown(signal) {
    if (stopping) return;
    stopping = true;
    console.log(`[cart-service] signal=${signal} step=shutdown_started`);
    await new Promise((resolve) => server.close(resolve));
    await stopConsumer();
    await stopOutbox();
    await bus.close();
    await db.close();
    console.log('[cart-service] step=shutdown_completed');
  }

  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, () => shutdown(signal).catch((error) => {
      console.error('[cart-service] step=shutdown_failed', error);
      process.exitCode = 1;
    }));
  }
}

main().catch((error) => {
  console.error('[cart-service] step=startup_failed', error);
  process.exitCode = 1;
});
