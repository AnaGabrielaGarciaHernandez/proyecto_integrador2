const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');
const {
  createSessionToken,
  serializeUser,
  sessionCookieOptions,
  verifySessionToken,
} = require('../src/services/session');

function createKeys() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }),
  };
}

test('signs and verifies an RS256 session with user identity claims', () => {
  const keys = createKeys();
  const user = {
    id: randomUUID(),
    role: 'cliente',
    full_name: 'Ada Lovelace',
  };
  const options = {
    ...keys,
    issuer: 'ecobazar-identity',
    audience: 'ecobazar-api',
    expiresIn: '7d',
  };

  const session = createSessionToken(user, options);
  const decoded = jwt.decode(session.token, { complete: true });
  const verified = verifySessionToken(session.token, options);

  assert.equal(decoded.header.alg, 'RS256');
  assert.equal(verified.sub, user.id);
  assert.equal(verified.jti, session.id);
  assert.equal(verified.role, user.role);
  assert.equal(verified.name, user.full_name);
  assert.ok(session.expiresAt > new Date());
});

test('rejects a session issued for another audience', () => {
  const keys = createKeys();
  const session = createSessionToken(
    { id: randomUUID(), role: 'vendedor', full_name: 'Vendedora' },
    {
      ...keys,
      issuer: 'ecobazar-identity',
      audience: 'different-api',
      expiresIn: '1h',
    },
  );

  assert.throws(() => verifySessionToken(session.token, {
    publicKey: keys.publicKey,
    issuer: 'ecobazar-identity',
    audience: 'ecobazar-api',
  }), /audience/i);
});

test('uses secure cross-site cookies only in production', () => {
  assert.deepEqual(sessionCookieOptions('development'), {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
  });
  assert.deepEqual(sessionCookieOptions('production'), {
    httpOnly: true,
    sameSite: 'none',
    secure: true,
    path: '/',
  });
});

test('keeps the established public user response contract', () => {
  const user = {
    id: randomUUID(),
    email: 'ada@example.com',
    full_name: 'Ada',
    role: 'cliente',
    auth_provider: 'email',
    phone: null,
    bio: null,
    is_active: true,
    created_at: new Date().toISOString(),
    password_hash: 'must-not-leak',
  };
  const serialized = serializeUser(user);
  assert.equal(serialized.email, user.email);
  assert.equal(serialized.password_hash, undefined);
});
