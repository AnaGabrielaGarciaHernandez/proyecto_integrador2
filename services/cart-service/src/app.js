const express = require('express');
const {
  correlationMiddleware,
  requestLogger,
  notFound,
  errorHandler,
} = require('@ecobazar/platform');
const { createCatalogClient } = require('./services/catalog-client');
const { createCartRouter } = require('./routes/cart');
const { createInternalRouter } = require('./routes/internal');

function createApp({ db, config, catalogClient }) {
  const app = express();
  const client = catalogClient || createCatalogClient({
    baseUrl: config.CATALOG_SERVICE_URL,
    internalToken: config.INTERNAL_SERVICE_TOKEN,
    timeoutMs: config.CATALOG_HTTP_TIMEOUT_MS,
  });

  app.disable('x-powered-by');
  app.use(correlationMiddleware('cart-service'));
  app.use(requestLogger('cart-service'));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health/live', (req, res) => res.json({ ok: true, service: 'cart-service' }));
  app.get('/health/ready', async (req, res, next) => {
    try {
      await db.health();
      res.json({ ok: true, service: 'cart-service' });
    } catch (error) {
      next(error);
    }
  });

  app.use('/api/cart', createCartRouter({ db, catalogClient: client }));
  app.use('/internal', createInternalRouter({ db, internalToken: config.INTERNAL_SERVICE_TOKEN }));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
