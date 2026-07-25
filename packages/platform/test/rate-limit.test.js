const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createPostgresRateLimiter,
  createRateLimitMiddleware,
  hashBucketKey,
} = require('../src');

test('rate limit buckets are HMAC-hashed and enforce a fixed window', async () => {
  let now = 0;
  let bucket = null;
  let insertedKey = null;
  const db = {
    async transaction(work) {
      return work({
        async query(sql, params = []) {
          if (/SELECT window_started_at/i.test(sql)) {
            return { rows: bucket ? [{ ...bucket }] : [] };
          }
          if (/INSERT INTO rate_limit_buckets/i.test(sql)) {
            insertedKey = params[0];
            bucket = { window_started_at: params[1], attempt_count: 1 };
            return { rows: [] };
          }
          if (/SET window_started_at/i.test(sql)) {
            bucket = { window_started_at: params[1], attempt_count: 1 };
            return { rows: [] };
          }
          if (/SET attempt_count = attempt_count \+ 1/i.test(sql)) {
            bucket.attempt_count += 1;
            return { rows: [] };
          }
          throw new Error(`Unexpected SQL: ${sql}`);
        },
      });
    },
    async query() {
      return { rows: [] };
    },
  };
  const limiter = createPostgresRateLimiter({
    db,
    scope: 'test',
    maxAttempts: 2,
    windowMs: 1000,
    hashSecret: 'test-secret-which-is-long-enough',
    now: () => now,
  });

  assert.deepEqual(await limiter.consume('user@example.com'), {
    allowed: true,
    retryAfterSeconds: 0,
  });
  assert.deepEqual(await limiter.consume('user@example.com'), {
    allowed: true,
    retryAfterSeconds: 0,
  });
  const limited = await limiter.consume('user@example.com');
  assert.equal(limited.allowed, false);
  assert.equal(limited.retryAfterSeconds, 1);
  assert.equal(insertedKey, hashBucketKey('test-secret-which-is-long-enough', 'test:user@example.com'));
  assert.doesNotMatch(insertedKey, /user@example\.com/);

  now = 1001;
  assert.deepEqual(await limiter.consume('user@example.com'), {
    allowed: true,
    retryAfterSeconds: 0,
  });
});

test('rate limit middleware exposes Retry-After without leaking the bucket key', async () => {
  const headers = {};
  const errors = [];
  const middleware = createRateLimitMiddleware({
    limiter: { consume: async () => ({ allowed: false, retryAfterSeconds: 12 }) },
    keyResolver: () => 'private-user-key',
  });
  await middleware(
    {},
    { set(name, value) { headers[name] = value; } },
    (error) => errors.push(error),
  );

  assert.equal(headers['Retry-After'], '12');
  assert.equal(errors[0].status, 429);
  assert.equal(errors[0].details.retry_after_seconds, 12);
  assert.doesNotMatch(errors[0].message, /private-user-key/);
});
