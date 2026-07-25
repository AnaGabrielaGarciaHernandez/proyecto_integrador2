const express = require('express');
const {
  correlationMiddleware,
  requestLogger,
  createPostgresRateLimiter,
  createRateLimitMiddleware,
  requireInternalToken,
  createHttpError,
  notFound,
  errorHandler,
} = require('@ecobazar/platform');

function createApp({ db, serviceToken, checkoutService, webhookService, config = {} }) {
  const app = express();
  app.use(correlationMiddleware('payment-service'));
  app.use(requestLogger('payment-service'));
  const webhookLimiter = createPostgresRateLimiter({
    db,
    scope: 'payment:webhook',
    maxAttempts: Number(config.RATE_LIMIT_MUTATION_MAX || 120),
    windowMs: Number(config.RATE_LIMIT_MUTATION_WINDOW_MS || 60 * 60 * 1000),
    hashSecret: config.RATE_LIMIT_HASH_KEY,
  });
  const webhookRateLimit = createRateLimitMiddleware({
    limiter: webhookLimiter,
    keyResolver: (req) => req.get('x-client-ip') || req.ip || 'unknown',
  });

  app.post('/api/stripe/webhook', webhookRateLimit, express.raw({ type: 'application/json' }), async (req, res, next) => {
    try {
      const event = webhookService.constructEvent(req.body, req.get('stripe-signature'));
      await webhookService.processEvent(event);
      res.json({ received: true });
    } catch (error) {
      next(error);
    }
  });

  app.use(express.json({ limit: '1mb' }));
  app.get('/health/live', (req, res) => res.json({ ok: true, service: 'payment-service' }));
  app.get('/health/ready', async (req, res, next) => {
    try {
      await db.health();
      res.json({ ok: true, service: 'payment-service' });
    } catch (error) {
      next(error);
    }
  });

  const internal = express.Router();
  internal.use(requireInternalToken(serviceToken));
  internal.post('/checkout-sessions', async (req, res, next) => {
    try {
      res.status(201).json(await checkoutService.createCheckout(req.body, req.correlationId));
    } catch (error) {
      next(error);
    }
  });
  internal.post('/checkout-sessions/:orderId/expire', async (req, res, next) => {
    try {
      ensureUuid(req.params.orderId);
      res.json(await checkoutService.expireCheckout(req.params.orderId, req.correlationId));
    } catch (error) {
      next(error);
    }
  });
  internal.get('/privacy/users/:userId/export', async (req, res, next) => {
    try {
      ensureUuid(req.params.userId);
      const result = await db.query(
        `SELECT id, order_id, buyer_id, provider, status, amount_cents,
                currency, stripe_checkout_session_id, stripe_payment_intent_id,
                stripe_charge_id, stripe_receipt_url, checkout_expires_at,
                failure_code, created_at, updated_at
         FROM payment.payments
         WHERE buyer_id = $1
         ORDER BY created_at DESC`,
        [req.params.userId],
      );
      res.json({ data: { payments: result.rows } });
    } catch (error) {
      next(error);
    }
  });
  internal.post('/privacy/users/:userId/anonymize', async (req, res, next) => {
    try {
      ensureUuid(req.params.userId);
      const result = await db.transaction(async (client) => {
        const payments = await client.query(
          `UPDATE payment.payments
           SET buyer_id = md5($1::text)::uuid,
               stripe_checkout_url = NULL,
               stripe_receipt_url = NULL,
               failure_message = NULL,
               raw_event = NULL,
               updated_at = now()
           WHERE buyer_id = $1
           RETURNING order_id`,
          [req.params.userId],
        );
        await client.query(
          `UPDATE payment.stripe_events se
           SET raw_event = jsonb_build_object(
             'redacted', true,
             'event_id', se.event_id,
             'event_type', se.event_type
           )
           WHERE se.order_id = ANY($1::uuid[])`,
          [payments.rows.map((row) => row.order_id)],
        );
        return payments.rowCount;
      });
      res.json({ service: 'payment', status: 'completed', payments: result });
    } catch (error) {
      next(error);
    }
  });
  app.use('/internal', internal);

  app.use(notFound);
  app.use(validationError);
  app.use(errorHandler);
  return app;
}

function ensureUuid(value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw createHttpError('Payment not found', 404);
  }
}

function validationError(error, req, res, next) {
  void req;
  void res;
  if (error?.name === 'ZodError') {
    return next(createHttpError('Invalid request', 400, {
      code: 'INVALID_REQUEST', issues: error.issues,
    }));
  }
  return next(error);
}

module.exports = { createApp };
