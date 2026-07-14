const express = require('express');
const {
  correlationMiddleware,
  requestLogger,
  createHttpError,
  notFound,
  errorHandler,
} = require('@ecobazar/platform');

function createApp({ db }) {
  const app = express();
  app.use(correlationMiddleware('moderation-service'));
  app.use(requestLogger('moderation-service'));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health/live', (req, res) => res.json({ status: 'live', service: 'moderation-service' }));
  app.get('/health/ready', async (req, res, next) => {
    try {
      await db.health();
      res.json({ status: 'ready', service: 'moderation-service' });
    } catch (error) {
      next(createHttpError('Moderation database is unavailable', 503));
    }
  });

  app.use('/api/reviews', requireUser, pending('Review'));
  app.use('/api/admin', requireUser, requireAdmin, pending('Admin'));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

function pending(area) {
  return (req, res, next) => {
    void req;
    void res;
    next(createHttpError(`${area} endpoints are not implemented yet`, 501));
  };
}

function requireUser(req, res, next) {
  void res;
  const userId = req.get('x-user-id');
  if (!isUuid(userId)) return next(createHttpError('Authentication required', 401));
  req.user = { id: userId, role: req.get('x-user-role') || 'cliente' };
  return next();
}

function requireAdmin(req, res, next) {
  void res;
  if (req.user?.role !== 'admin') return next(createHttpError('Forbidden', 403));
  return next();
}

function isUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

module.exports = { createApp, pending, requireUser, requireAdmin };
