const { createHmac } = require('node:crypto');
const { createHttpError } = require('./http');

const DEFAULT_HASH_SECRET = 'ecobazar-development-rate-limit-secret';

function createPostgresRateLimiter({
  db,
  scope,
  maxAttempts,
  windowMs,
  hashSecret = DEFAULT_HASH_SECRET,
  now = () => Date.now(),
} = {}) {
  if (!db || !scope || !Number.isInteger(maxAttempts) || maxAttempts <= 0
    || !Number.isInteger(windowMs) || windowMs <= 0) {
    throw new Error('createPostgresRateLimiter requires db, scope, maxAttempts and windowMs');
  }

  async function consume(rawKey) {
    const bucketKey = hashBucketKey(hashSecret, `${scope}:${rawKey || 'anonymous'}`);
    const currentTime = now();
    const currentDate = new Date(currentTime);

    const result = await db.transaction(async (client) => {
      const existing = await client.query(
        `SELECT window_started_at, attempt_count
         FROM rate_limit_buckets
         WHERE bucket_key = $1
         FOR UPDATE`,
        [bucketKey],
      );

      if (!existing.rows[0]) {
        await client.query(
          `INSERT INTO rate_limit_buckets
             (bucket_key, window_started_at, attempt_count, updated_at)
           VALUES ($1, $2, 1, now())`,
          [bucketKey, currentDate],
        );
        return { allowed: true, retryAfterSeconds: 0 };
      }

      const startedAt = new Date(existing.rows[0].window_started_at).getTime();
      if (currentTime - startedAt >= windowMs) {
        await client.query(
          `UPDATE rate_limit_buckets
           SET window_started_at = $2, attempt_count = 1, updated_at = now()
           WHERE bucket_key = $1`,
          [bucketKey, currentDate],
        );
        return { allowed: true, retryAfterSeconds: 0 };
      }

      const attemptCount = Number(existing.rows[0].attempt_count);
      if (attemptCount >= maxAttempts) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((startedAt + windowMs - currentTime) / 1000)),
        };
      }

      await client.query(
        `UPDATE rate_limit_buckets
         SET attempt_count = attempt_count + 1, updated_at = now()
         WHERE bucket_key = $1`,
        [bucketKey],
      );
      return { allowed: true, retryAfterSeconds: 0 };
    });

    // Cleanup is opportunistic so the limiter does not create an additional
    // timer per service or per route. The stored key remains HMAC-hashed.
    if (currentTime - lastCleanupAt >= cleanupIntervalMs) {
      lastCleanupAt = currentTime;
      await cleanup().catch(() => {});
    }
    return result;
  }

  const cleanupIntervalMs = Math.max(windowMs * 2, 24 * 60 * 60 * 1000);
  let lastCleanupAt = now();

  async function cleanup(olderThanMs = Math.max(windowMs * 2, 24 * 60 * 60 * 1000)) {
    await db.query(
      `DELETE FROM rate_limit_buckets
       WHERE updated_at < now() - ($1 * interval '1 millisecond')`,
      [olderThanMs],
    );
  }

  return { consume, cleanup };
}

function createRateLimitMiddleware({
  limiter,
  keyResolver,
  message = 'Has alcanzado el límite temporal de solicitudes.',
  code = 'RATE_LIMITED',
} = {}) {
  if (!limiter || typeof limiter.consume !== 'function' || typeof keyResolver !== 'function') {
    throw new Error('createRateLimitMiddleware requires limiter and keyResolver');
  }

  return async function rateLimitMiddleware(req, res, next) {
    try {
      const result = await limiter.consume(keyResolver(req));
      if (result.allowed) return next();
      res.set('Retry-After', String(result.retryAfterSeconds));
      return next(createHttpError(message, 429, {
        code,
        retry_after_seconds: result.retryAfterSeconds,
      }));
    } catch (error) {
      return next(error);
    }
  };
}

function hashBucketKey(secret, value) {
  return createHmac('sha256', String(secret || DEFAULT_HASH_SECRET))
    .update(String(value))
    .digest('hex');
}

module.exports = {
  DEFAULT_HASH_SECRET,
  createPostgresRateLimiter,
  createRateLimitMiddleware,
  hashBucketKey,
};
