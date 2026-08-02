const { createHttpError } = require('@ecobazar/platform');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function requestOrigin(req) {
  const candidate = req.get('origin') || req.get('referer');
  if (!candidate) return null;

  try {
    return new URL(candidate).origin;
  } catch {
    return null;
  }
}

function createOriginGuard({ nodeEnv = 'test', allowedOrigins = [], cookieName = 'ecobazar_session' }) {
  const origins = new Set(allowedOrigins.filter(Boolean).map((origin) => new URL(origin).origin));

  return (req, _res, next) => {
    if (nodeEnv !== 'production' || SAFE_METHODS.has(req.method)) return next();
    if (req.path === '/stripe/webhook' || req.path === '/api/stripe/webhook') return next();

    const hasSessionCookie = Boolean(req.cookies?.[cookieName]);
    const hasAuthorization = Boolean(req.get('authorization'));
    const origin = requestOrigin(req);

    // Bearer-token integrations do not use ambient browser credentials.
    if (!hasSessionCookie && hasAuthorization && !origin) return next();

    if (!origin || !origins.has(origin)) {
      return next(createHttpError('Origin not allowed', 403, { code: 'CSRF_ORIGIN_REJECTED' }));
    }

    return next();
  };
}

function createMemoryRateLimitMiddleware({
  windowMs = 60_000,
  max = 300,
  keyResolver = (req) => req.ip || req.socket.remoteAddress || 'unknown',
  skip = () => false,
} = {}) {
  const buckets = new Map();
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, Math.min(windowMs, 60_000));
  cleanup.unref?.();

  return (req, res, next) => {
    if (skip(req)) return next();

    const key = String(keyResolver(req));
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      return next(createHttpError('Too many requests', 429, { code: 'EDGE_RATE_LIMITED' }));
    }

    return next();
  };
}

module.exports = {
  createMemoryRateLimitMiddleware,
  createOriginGuard,
};
