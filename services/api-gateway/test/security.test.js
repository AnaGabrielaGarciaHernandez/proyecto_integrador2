const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createMemoryRateLimitMiddleware,
  createOriginGuard,
} = require('../src/middleware/security');

function request({ method = 'POST', origin, cookies = {}, authorization } = {}) {
  return {
    method,
    path: '/api/auth/login',
    cookies,
    get(name) {
      if (name.toLowerCase() === 'origin') return origin;
      if (name.toLowerCase() === 'authorization') return authorization;
      return undefined;
    },
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  };
}

function response() {
  return { headers: {}, setHeader(name, value) { this.headers[name] = value; } };
}

test('production origin guard accepts same-origin cookie mutations and rejects foreign origins', () => {
  const guard = createOriginGuard({
    nodeEnv: 'production',
    allowedOrigins: ['https://app.example.com'],
  });
  let accepted = false;
  guard(request({ origin: 'https://app.example.com', cookies: { ecobazar_session: 'session' } }), response(), (error) => {
    assert.equal(error, undefined);
    accepted = true;
  });
  assert.equal(accepted, true);

  let rejected;
  guard(request({ origin: 'https://evil.example', cookies: { ecobazar_session: 'session' } }), response(), (error) => {
    rejected = error;
  });
  assert.equal(rejected.status, 403);
  assert.equal(rejected.details.code, 'CSRF_ORIGIN_REJECTED');
});

test('edge rate limiter exposes retry metadata after the threshold', () => {
  const middleware = createMemoryRateLimitMiddleware({ windowMs: 60_000, max: 1 });
  const req = request({ method: 'GET' });
  const firstResponse = response();
  let firstError;
  middleware(req, firstResponse, (error) => { firstError = error; });
  assert.equal(firstError, undefined);

  const secondResponse = response();
  let secondError;
  middleware(req, secondResponse, (error) => { secondError = error; });
  assert.equal(secondError.status, 429);
  assert.equal(secondResponse.headers['Retry-After'], '60');
});
