const express = require('express');
const {
  correlationMiddleware,
  requestLogger,
  notFound,
  errorHandler,
} = require('@ecobazar/platform');
const { createProductsRouter } = require('./routes/products');
const { createInternalRouter } = require('./routes/internal');
const { createSellerRouter } = require('./routes/seller');
const { createWishlistRouter } = require('./routes/wishlist');

function createApp({ db, config }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(correlationMiddleware('catalog-service'));
  app.use(requestLogger('catalog-service'));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health/live', (req, res) => res.json({ ok: true, service: 'catalog-service' }));
  app.get('/health/ready', async (req, res, next) => {
    try {
      await db.health();
      res.json({ ok: true, service: 'catalog-service' });
    } catch (error) {
      next(error);
    }
  });

  app.use('/api/products', createProductsRouter(db));
  app.use('/api/wishlist', createWishlistRouter(db));
  app.use('/api/seller', createSellerRouter());
  app.use('/internal', createInternalRouter({ db, internalToken: config.INTERNAL_SERVICE_TOKEN }));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
