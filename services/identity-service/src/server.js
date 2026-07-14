const {
  createDb,
  createRabbitBus,
  startOutboxWorker,
} = require('@ecobazar/platform');
const { createApp } = require('./app');
const env = require('./config/env');
const { loadPrivateKey } = require('./config/keys');

async function start() {
  const privateKey = loadPrivateKey(env);
  const db = createDb({ connectionString: env.DATABASE_URL, schema: 'identity' });
  const bus = createRabbitBus({
    url: env.RABBITMQ_URL,
    serviceName: 'identity-service',
  });
  await db.health();
  await bus.connect();
  const stopOutbox = startOutboxWorker({
    db,
    bus,
    serviceName: 'identity-service',
    intervalMs: env.OUTBOX_INTERVAL_MS,
  });
  const app = createApp({ db, config: env, privateKey });
  const server = app.listen(env.PORT, () => {
    console.log(`[identity-service] port=${env.PORT} step=service_started`);
  });

  let stopping = false;
  async function shutdown(signal) {
    if (stopping) return;
    stopping = true;
    console.log(`[identity-service] signal=${signal} step=shutdown_started`);
    server.close(async () => {
      try {
        await stopOutbox();
        await bus.close();
        await db.close();
        console.log('[identity-service] step=shutdown_finished');
        process.exitCode = 0;
      } catch (error) {
        console.error('[identity-service] step=shutdown_failed', error);
        process.exitCode = 1;
      }
    });
  }

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
  return { app, server, db, bus, shutdown };
}

if (require.main === module) {
  start().catch((error) => {
    console.error('[identity-service] step=startup_failed', error);
    process.exitCode = 1;
  });
}

module.exports = { start };
