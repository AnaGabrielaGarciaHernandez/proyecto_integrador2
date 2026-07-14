const { createRabbitBus, startOutboxWorker } = require('@ecobazar/platform');
const env = require('./config/env');
const db = require('./config/db');
const { getStripe } = require('./config/stripe');
const { createPaymentsRepository } = require('./repositories/payments');
const { createPaymentCheckoutService } = require('./services/checkout');
const { createWebhookService } = require('./services/webhooks');
const { createApp } = require('./app');

async function main() {
  await db.health();
  const payments = createPaymentsRepository(db);
  const checkoutService = createPaymentCheckoutService({
    payments,
    stripeProvider: getStripe,
    clientOrigin: env.CLIENT_ORIGIN,
  });
  const webhookService = createWebhookService({
    payments,
    stripeProvider: getStripe,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
  });
  const bus = createRabbitBus({ url: env.RABBITMQ_URL, serviceName: 'payment-service' });
  await bus.connect();
  const stopOutbox = startOutboxWorker({
    db, bus, serviceName: 'payment-service', intervalMs: env.OUTBOX_INTERVAL_MS,
  });
  const app = createApp({
    db, serviceToken: env.INTERNAL_SERVICE_TOKEN, checkoutService, webhookService,
  });
  const server = app.listen(env.PORT, () => {
    console.log(`[payment-service] port=${env.PORT} step=listening`);
  });

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[payment-service] signal=${signal} step=shutdown_started`);
    server.close();
    await stopOutbox();
    await bus.close();
    await db.close();
  }
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  console.error('[payment-service] step=startup_failed', error);
  process.exitCode = 1;
});
