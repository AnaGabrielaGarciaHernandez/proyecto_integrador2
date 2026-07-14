const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');
const {
  createIdentityMiddleware,
  sanitizeHeaderValue,
  stripUntrustedHeaders,
} = require('../src/middleware/identity');

function keys() {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }),
  };
}

function request(headers, cookies = {}) {
  return {
    headers: { ...headers },
    cookies,
    correlationId: randomUUID(),
    get(name) {
      return this.headers[name.toLowerCase()];
    },
  };
}

test('removes spoofed identity and internal authentication headers', () => {
  const headers = {
    'x-user-id': 'forged',
    'x-user-role': 'admin',
    'x-user-name': 'Attacker',
    'x-internal-token': 'forged',
    accept: 'application/json',
  };
  stripUntrustedHeaders(headers);
  assert.deepEqual(headers, { accept: 'application/json' });
});

test('adds trusted identity headers only after RS256 verification and active-session introspection', async () => {
  const { privateKey, publicKey } = keys();
  const userId = randomUUID();
  const sessionId = randomUUID();
  const token = jwt.sign({ role: 'vendedor', name: 'Tienda Ñ' }, privateKey, {
    algorithm: 'RS256',
    subject: userId,
    jwtid: sessionId,
    issuer: 'ecobazar-identity',
    audience: 'ecobazar-api',
    expiresIn: '1h',
  });
  const req = request({ 'x-user-role': 'admin' }, { session: token });
  const middleware = createIdentityMiddleware({
    config: {
      COOKIE_NAME: 'session',
      JWT_ISSUER: 'ecobazar-identity',
      JWT_AUDIENCE: 'ecobazar-api',
      IDENTITY_SERVICE_URL: 'http://identity:4001',
      INTERNAL_SERVICE_TOKEN: 'test-internal-token-32-characters',
      SESSION_TIMEOUT_MS: 100,
    },
    publicKey,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        user: { id: userId, role: 'vendedor', full_name: 'Tienda Ñ' },
      }),
    }),
  });
  let called = false;
  await middleware(req, {}, () => { called = true; });

  assert.equal(called, true);
  assert.equal(req.headers['x-user-id'], userId);
  assert.equal(req.headers['x-user-role'], 'vendedor');
  assert.equal(req.headers['x-user-name'], 'Tienda Ñ');
  assert.equal(req.headers['x-correlation-id'], req.correlationId);
});

test('ignores an invalid token instead of trusting client headers', async () => {
  const { publicKey } = keys();
  const req = request({ 'x-user-role': 'admin' }, { session: 'not-a-jwt' });
  const middleware = createIdentityMiddleware({
    config: {
      COOKIE_NAME: 'session',
      JWT_ISSUER: 'ecobazar-identity',
      JWT_AUDIENCE: 'ecobazar-api',
      IDENTITY_SERVICE_URL: 'http://identity:4001',
      INTERNAL_SERVICE_TOKEN: 'test-internal-token-32-characters',
    },
    publicKey,
  });
  await middleware(req, {}, () => {});
  assert.equal(req.headers['x-user-role'], undefined);
  assert.equal(req.auth, undefined);
  assert.ok(req.authError);
});

test('does not forward identity from a revoked session', async () => {
  const { privateKey, publicKey } = keys();
  const token = jwt.sign({ role: 'admin', name: 'Old admin' }, privateKey, {
    algorithm: 'RS256',
    subject: randomUUID(),
    jwtid: randomUUID(),
    issuer: 'ecobazar-identity',
    audience: 'ecobazar-api',
    expiresIn: '1h',
  });
  const req = request({}, { session: token });
  const middleware = createIdentityMiddleware({
    config: {
      COOKIE_NAME: 'session',
      JWT_ISSUER: 'ecobazar-identity',
      JWT_AUDIENCE: 'ecobazar-api',
      IDENTITY_SERVICE_URL: 'http://identity:4001',
      INTERNAL_SERVICE_TOKEN: 'test-internal-token-32-characters',
      SESSION_TIMEOUT_MS: 100,
    },
    publicKey,
    fetchImpl: async () => ({ ok: false, status: 404 }),
  });

  await middleware(req, {}, () => {});

  assert.equal(req.headers['x-user-id'], undefined);
  assert.equal(req.headers['x-user-role'], undefined);
  assert.ok(req.authError);
});

test('removes control characters and unsupported Unicode from user-name headers', () => {
  assert.equal(sanitizeHeaderValue('Ana\r\nAdmin 😀'), 'AnaAdmin ');
});
