const express = require('express');
const {
  correlationMiddleware,
  requestLogger,
  createPostgresRateLimiter,
  createRateLimitMiddleware,
  notFound,
  errorHandler,
} = require('@ecobazar/platform');
const { createProductsRouter } = require('./routes/products');
const { createInternalRouter } = require('./routes/internal');
const { createSellerRouter } = require('./routes/seller');
const { createSellerApplicationsRouter } = require('./routes/seller-applications');
const { createWishlistRouter } = require('./routes/wishlist');
const { createCategoriesRouter } = require('./routes/categories');

function createApp({ db, config, storage }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(correlationMiddleware('catalog-service'));
  app.use(requestLogger('catalog-service'));
  app.use(express.json({ limit: '1mb' }));
  const mutationLimiter = createPostgresRateLimiter({
    db,
    scope: 'catalog:mutation',
    maxAttempts: config.RATE_LIMIT_MUTATION_MAX,
    windowMs: config.RATE_LIMIT_MUTATION_WINDOW_MS,
    hashSecret: config.RATE_LIMIT_HASH_KEY,
  });
  const mutationRateLimit = createRateLimitMiddleware({
    limiter: mutationLimiter,
    keyResolver: (req) => `${req.get('x-user-id') || 'anonymous'}:${req.path}`,
  });

  app.get('/health/live', (req, res) => res.json({ ok: true, service: 'catalog-service' }));
  app.get('/health/ready', async (req, res, next) => {
    try {
      await db.health();
      res.json({ ok: true, service: 'catalog-service' });
    } catch (error) {
      next(error);
    }
  });

  app.use('/api/categories', createCategoriesRouter(db));
  app.use('/api/products', createProductsRouter(db));
  app.use('/api/wishlist', createWishlistRouter(db, { mutationRateLimit }));
  app.use('/api/seller-applications', createSellerApplicationsRouter(db, { mutationRateLimit }));
  app.use('/api/seller', createSellerRouter({
    db,
    config,
    storage,
    mutationRateLimit,
  }));
  app.use('/internal', createInternalRouter({
    db,
    internalToken: config.INTERNAL_SERVICE_TOKEN,
    storage,
  }));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
