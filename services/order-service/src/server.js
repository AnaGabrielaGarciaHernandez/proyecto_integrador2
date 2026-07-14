const {
  createRabbitBus,
  startConsumer,
  startOutboxWorker,
} = require('@ecobazar/platform');
const { EVENT_TYPES } = require('@ecobazar/contracts');
const env = require('./config/env');
const db = require('./config/db');
const { createOrdersRepository } = require('./repositories/orders');
const { cartClient, catalogClient, paymentClient } = require('./http/dependencies');
const { createCheckoutService } = require('./services/checkout');
const { createPaymentEventHandler } = require('./services/paymentEvents');
const { startCompensationWorker } = require('./workers/compensation');
const { createApp } = require('./app');

async function main() {
  await db.health();
  const orders = createOrdersRepository(db);
  const checkoutService = createCheckoutService({
    db, orders, cartClient, catalogClient, paymentClient,
  });
  const bus = createRabbitBus({ url: env.RABBITMQ_URL, serviceName: 'order-service' });
  await bus.connect();
  const stopOutbox = startOutboxWorker({
    db, bus, serviceName: 'order-service', intervalMs: env.OUTBOX_INTERVAL_MS,
  });
  const stopConsumer = await startConsumer({
    db,
    bus,
    serviceName: 'order-service',
    queue: 'order-service.payments',
    bindings: [
      EVENT_TYPES.PAYMENT_COMPLETED,
      EVENT_TYPES.PAYMENT_FAILED,
      EVENT_TYPES.PAYMENT_EXPIRED,
      EVENT_TYPES.PAYMENT_CANCELLED,
    ],
    handler: createPaymentEventHandler({ orders, catalogClient }),
    maxRetries: 5,
  });
  const stopCompensation = startCompensationWorker({
    orders, checkoutService, paymentClient, intervalMs: env.COMPENSATION_INTERVAL_MS,
  });
  const app = createApp({ db, orders, checkoutService });
  const server = app.listen(env.PORT, () => {
    console.log(`[order-service] port=${env.PORT} step=listening`);
  });

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[order-service] signal=${signal} step=shutdown_started`);
    server.close();
    await Promise.allSettled([stopCompensation(), stopConsumer(), stopOutbox()]);
    await bus.close();
    await db.close();
  }
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  console.error('[order-service] step=startup_failed', error);
  process.exitCode = 1;
});
