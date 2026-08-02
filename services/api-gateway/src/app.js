const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const { createProxyMiddleware } = require('http-proxy-middleware');
const {
  correlationMiddleware,
  errorHandler,
  notFound,
  requestLogger,
  safeLog,
  createMetricsRegistry,
} = require('@ecobazar/platform');
const { createIdentityMiddleware } = require('./middleware/identity');
const { createMemoryRateLimitMiddleware, createOriginGuard } = require('./middleware/security');
const { checkServices } = require('./services/health');
const {
  createServiceTargets,
  resolveService,
  resolveTarget,
} = require('./services/routing');

function createApp({ config, publicKey, fetchImpl } = {}) {
  if (!config || !publicKey) throw new Error('createApp requires config and publicKey');
  const targets = createServiceTargets(config);
  const app = express();
  const metrics = createMetricsRegistry('api-gateway');
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY_HOPS ?? 1);

  app.use(helmet());
  app.use(metrics.middleware);
  app.use(cookieParser());
  app.use('/api', createMemoryRateLimitMiddleware({
    windowMs: config.EDGE_RATE_LIMIT_WINDOW_MS,
    max: config.EDGE_RATE_LIMIT_MAX,
    skip: (req) => req.path === '/health'
      || req.path === '/stripe/webhook'
      || req.path === '/api/stripe/webhook',
  }));
  app.use(createOriginGuard({
    nodeEnv: config.NODE_ENV,
    allowedOrigins: config.CLIENT_ORIGIN.split(',').map((origin) => origin.trim()),
    cookieName: config.COOKIE_NAME,
  }));
  app.use(cors({
    origin: config.CLIENT_ORIGIN.split(',').map((origin) => origin.trim()),
    credentials: true,
  }));
  app.use(correlationMiddleware('api-gateway'));
  app.use(requestLogger('api-gateway'));
  app.use(createIdentityMiddleware({ config, publicKey, fetchImpl }));
  app.use((req, res, next) => {
    void res;
    req.headers['x-client-ip'] = req.ip || 'unknown';
    next();
  });

  app.get('/health/live', (req, res) => res.json({ ok: true }));
  app.get('/metrics', (req, res) => {
    res.type('text/plain').send(metrics.render());
  });
  const readiness = async (req, res, next) => {
    try {
      const result = await checkServices(targets, {
        fetchImpl,
        timeoutMs: config.HEALTH_TIMEOUT_MS,
      });
      res.status(result.ok ? 200 : 503).json(result);
    } catch (error) {
      next(error);
    }
  };
  app.get('/health/ready', readiness);
  app.get('/api/health', readiness);

  const serviceProxy = createProxyMiddleware({
    target: targets.identity,
    router: (req) => req.ecobazarProxyTarget,
    changeOrigin: false,
    xfwd: true,
    timeout: config.PROXY_TIMEOUT_MS,
    proxyTimeout: config.PROXY_TIMEOUT_MS,
    on: {
      proxyReq: (proxyReq, req) => {
        proxyReq.setHeader('x-correlation-id', req.correlationId);
      },
      error: (error, req, res) => {
        safeLog('error', 'api-gateway', {
          correlation_id: req.correlationId,
          target_service: req.ecobazarService || 'unknown',
          step: 'proxy_failed',
        }, error);
        if (res.headersSent) {
          res.destroy(error);
          return;
        }
        res.statusCode = 503;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({
          error: {
            message: 'Service temporarily unavailable',
            details: { code: 'SERVICE_UNAVAILABLE' },
          },
        }));
      },
    },
  });

  // No body parser is mounted in the gateway. The original request stream,
  // including Stripe's signed webhook bytes and multipart uploads, is proxied intact.
  app.use((req, res, next) => {
    const service = resolveService(req.path);
    const target = resolveTarget(req.path, targets);
    if (!service || !target) return next();
    req.ecobazarService = service;
    req.ecobazarProxyTarget = target;
    return serviceProxy(req, res, next);
  });

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
