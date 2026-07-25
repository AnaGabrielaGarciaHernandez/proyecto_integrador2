const express = require('express');
const { z } = require('zod');
const {
  correlationMiddleware,
  requestLogger,
  createPostgresRateLimiter,
  createRateLimitMiddleware,
  createHttpError,
  requireInternalToken,
  notFound,
  errorHandler,
} = require('@ecobazar/platform');

const adminController = require('./controllers/admin');

function createApp({ db, internalToken, config = {} }) {
  const app = express();
  app.use(correlationMiddleware('moderation-service'));
  app.use(requestLogger('moderation-service'));
  app.use(express.json({ limit: '1mb' }));
  const mutationLimiter = createPostgresRateLimiter({
    db,
    scope: 'moderation:mutation',
    maxAttempts: Number(config.RATE_LIMIT_MUTATION_MAX || 120),
    windowMs: Number(config.RATE_LIMIT_MUTATION_WINDOW_MS || 60 * 60 * 1000),
    hashSecret: config.RATE_LIMIT_HASH_KEY,
  });
  const mutationRateLimit = createRateLimitMiddleware({
    limiter: mutationLimiter,
    keyResolver: (req) => `${req.get('x-user-id') || 'anonymous'}:${req.path}`,
  });

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
  const adminRouter = express.Router();
  adminRouter.get('/users', adminController.getUsers);
  adminRouter.patch('/users/:id/suspend', mutationRateLimit, adminController.suspendUser);
  adminRouter.delete('/users/:id', mutationRateLimit, adminController.deleteUser);
  adminRouter.patch('/users/:id/role', mutationRateLimit, adminController.changeRole);

  adminRouter.get('/seller-applications', adminController.getApplications);
  adminRouter.post('/seller-applications/:id/approve', mutationRateLimit, adminController.approveApplication);
  adminRouter.post('/seller-applications/:id/reject', mutationRateLimit, adminController.rejectApplication);

  adminRouter.get('/reports/sales', adminController.getSalesReports);

  app.use('/api/admin', requireUser, requireAdmin, adminRouter);

  const internal = express.Router();
  internal.use(requireInternalToken(internalToken));
  internal.get('/privacy/users/:userId/export', async (req, res, next) => {
    try {
      const userId = parseUuid(req.params.userId);
      const reviews = await db.query(
        `SELECT id, order_id, buyer_id, seller_id, rating, comment,
                created_at, updated_at
         FROM moderation.reviews
         WHERE buyer_id = $1
         ORDER BY created_at`,
        [userId],
      );
      const reports = await db.query(
        `SELECT id, reporter_id, target_type, target_id, reason, description,
                status, reviewed_at, created_at, updated_at
         FROM moderation.reports
         WHERE reporter_id = $1
         ORDER BY created_at`,
        [userId],
      );
      res.json({ data: { reviews: reviews.rows, reports: reports.rows } });
    } catch (error) {
      next(error);
    }
  });
  internal.post('/privacy/users/:userId/anonymize', async (req, res, next) => {
    try {
      const userId = parseUuid(req.params.userId);
      const result = await db.transaction(async (client) => {
        const reviews = await client.query(
          `UPDATE moderation.reviews
           SET buyer_id = NULL, comment = 'Contenido eliminado', updated_at = now()
           WHERE buyer_id = $1`,
          [userId],
        );
        const reports = await client.query(
          `UPDATE moderation.reports
           SET reporter_id = NULL, description = NULL, updated_at = now()
           WHERE reporter_id = $1`,
          [userId],
        );
        const actions = await client.query(
          `UPDATE moderation.admin_actions
           SET admin_id = NULL, notes = NULL
           WHERE admin_id = $1`,
          [userId],
        );
        return {
          reviews: reviews.rowCount,
          reports: reports.rowCount,
          admin_actions: actions.rowCount,
        };
      });
      res.json({ service: 'moderation', status: 'completed', result });
    } catch (error) {
      next(error);
    }
  });
  app.use('/internal', internal);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

function parseUuid(value) {
  const result = z.string().uuid().safeParse(value);
  if (!result.success) throw createHttpError('Invalid privacy user id', 400);
  return result.data;
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

module.exports = { createApp, pending, requireUser, requireAdmin, parseUuid };
