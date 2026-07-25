const { createHttpError } = require('@ecobazar/platform');

const DEFAULT_AVATAR_RATE_LIMIT_MAX = 10;
const DEFAULT_AVATAR_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

function createAvatarRateLimiter({
  maxAttempts = DEFAULT_AVATAR_RATE_LIMIT_MAX,
  windowMs = DEFAULT_AVATAR_RATE_LIMIT_WINDOW_MS,
  now = () => Date.now(),
} = {}) {
  const attemptsByUser = new Map();

  function consume(userId) {
    const currentTime = now();
    const existing = attemptsByUser.get(userId);
    const entry = existing && currentTime - existing.startedAt < windowMs
      ? existing
      : { startedAt: currentTime, count: 0 };

    if (entry.count >= maxAttempts) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((entry.startedAt + windowMs - currentTime) / 1000)),
      };
    }

    entry.count += 1;
    attemptsByUser.set(userId, entry);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  function middleware(req, res, next) {
    if (!req.is?.('multipart/form-data')) return next();

    const result = consume(req.user?.id || 'anonymous');
    if (result.allowed) return next();

    res.set('Retry-After', String(result.retryAfterSeconds));
    return next(createHttpError(
      'Has alcanzado el límite temporal de cambios de avatar.',
      429,
      { code: 'AVATAR_RATE_LIMITED', retry_after_seconds: result.retryAfterSeconds },
    ));
  }

  return { consume, middleware };
}

module.exports = {
  DEFAULT_AVATAR_RATE_LIMIT_MAX,
  DEFAULT_AVATAR_RATE_LIMIT_WINDOW_MS,
  createAvatarRateLimiter,
};
