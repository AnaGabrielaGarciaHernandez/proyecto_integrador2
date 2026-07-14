const express = require('express');
const {
  correlationMiddleware,
  requestLogger,
  requireInternalToken,
  createHttpError,
  notFound,
  errorHandler,
} = require('@ecobazar/platform');

function createApp({ db, serviceToken, checkoutService, webhookService }) {
  const app = express();
  app.use(correlationMiddleware('payment-service'));
  app.use(requestLogger('payment-service'));

  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res, next) => {
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
