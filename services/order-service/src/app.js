const express = require('express');
const {
  correlationMiddleware,
  requestLogger,
  notFound,
  errorHandler,
} = require('@ecobazar/platform');
const { requireUser, requireRole, ensureUuid } = require('./http/identity');

function createApp({ db, orders, checkoutService }) {
  const app = express();
  app.use(correlationMiddleware('order-service'));
  app.use(requestLogger('order-service'));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health/live', (req, res) => res.json({ ok: true, service: 'order-service' }));
  app.get('/health/ready', async (req, res, next) => {
    try {
      await db.health();
      const pendingCompensations = await orders.countPendingCompensations();
      res.status(pendingCompensations > 0 ? 503 : 200).json({
        ok: pendingCompensations === 0,
        service: 'order-service',
        pending_compensations: pendingCompensations,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/checkout', requireUser, async (req, res, next) => {
    try {
      const checkout = await checkoutService.createCheckout(req.user, req.correlationId);
      res.status(201).json({ checkout });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/checkout/:orderId/cancel', requireUser, async (req, res, next) => {
    try {
      const orderId = ensureUuid(req.params.orderId);
      const order = await checkoutService.cancelCheckout(orderId, req.user.id, req.correlationId);
      res.json({ order });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/orders', requireUser, async (req, res, next) => {
    try {
      res.json({ orders: await orders.getBuyerOrders(req.user.id) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/orders/:id', requireUser, async (req, res, next) => {
    try {
      res.json({ order: await orders.getBuyerOrder(ensureUuid(req.params.id), req.user.id) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/seller/orders', requireUser, requireRole('vendedor', 'admin'), async (req, res, next) => {
    try {
      res.json({ orders: await orders.getSellerOrders(req.user.id) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/seller/orders/:id', requireUser, requireRole('vendedor', 'admin'), async (req, res, next) => {
    try {
      res.json({ order: await orders.getSellerOrder(ensureUuid(req.params.id), req.user.id) });
    } catch (error) {
      next(error);
    }
  });

  app.use(notFound);
  app.use(validationError);
  app.use(errorHandler);
  return app;
}

function validationError(error, req, res, next) {
  void req;
  void res;
  if (error?.name === 'ZodError') {
    return next(Object.assign(new Error('Invalid request'), {
      status: 400,
      details: { code: 'INVALID_REQUEST', issues: error.issues },
    }));
  }
  return next(error);
}

module.exports = { createApp };
