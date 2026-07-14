const { createPublicKey } = require('node:crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const { OAuth2Client } = require('google-auth-library');
const {
  correlationMiddleware,
  errorHandler,
  notFound,
  requestLogger,
} = require('@ecobazar/platform');
const { createRequireAuth } = require('./middleware/auth');
const { createRequireInternalToken } = require('./middleware/internal');
const { createAuthRouter } = require('./routes/auth.routes');
const { createInternalRouter } = require('./routes/internal.routes');

function createApp({ db, config, privateKey, googleClient } = {}) {
  if (!db || !config || !privateKey) {
    throw new Error('createApp requires db, config and privateKey');
  }
  const publicKey = createPublicKey(privateKey);
  const oauthClient = googleClient || new OAuth2Client(config.GOOGLE_CLIENT_ID || undefined);
  const requireAuth = createRequireAuth({ db, config, publicKey });
  const requireInternalToken = createRequireInternalToken(
    [config.INTERNAL_SERVICE_TOKENS, config.INTERNAL_SERVICE_TOKEN].filter(Boolean).join(','),
  );

  const app = express();
  app.disable('x-powered-by');
  app.use(correlationMiddleware('identity-service'));
  app.use(requestLogger('identity-service'));
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/health/live', (req, res) => res.json({ ok: true }));
  app.get('/health/ready', async (req, res) => {
    try {
      await db.health();
      res.json({ ok: true });
    } catch (error) {
      console.error(
        `[identity-service] correlation_id=${req.correlationId} step=readiness_failed`,
        error,
      );
      res.status(503).json({ ok: false, error: 'Database unavailable' });
    }
  });

  app.use('/api/auth', createAuthRouter({
    db,
    config,
    privateKey,
    publicKey,
    googleClient: oauthClient,
    requireAuth,
  }));
  app.use('/internal', createInternalRouter({ db, requireInternalToken }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
