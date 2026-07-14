const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, randomUUID } = require('node:crypto');
const { createRequireAuth } = require('../src/middleware/auth');
const { createUpdatePreferencesHandler } = require('../src/routes/auth.routes');
const { createSessionToken } = require('../src/services/session');

const keys = createKeys();
const config = {
  COOKIE_NAME: 'session',
  JWT_AUDIENCE: 'ecobazar-api',
  JWT_EXPIRES_IN: '1h',
  JWT_ISSUER: 'ecobazar-identity',
};

test('preferences endpoint authentication rejects requests without a session', async () => {
  const harness = createDbHarness();
  const requireAuth = createRequireAuth({
    db: harness.db,
    config,
    publicKey: keys.publicKey,
  });
  const req = createRequest();
  const error = await runMiddleware(requireAuth, req);

  assert.equal(error.status, 401);
  assert.equal(error.message, 'Authentication required');
  assert.equal(harness.calls.length, 0);
});

test('preferences handler rejects missing and non-boolean values without writing', async () => {
  const harness = createDbHarness();
  const handler = createUpdatePreferencesHandler({ db: harness.db });
  for (const body of [{}, { show_home_sell_banner: 'false' }]) {
    const req = { body, user: harness.users[0] };
    const { error } = await runHandler(handler, req);
    assert.equal(error.status, 400);
  }

  assert.equal(
    harness.calls.some(({ text }) => /UPDATE identity\.users/i.test(text)),
    false,
  );
});

test('preferences handler updates only the authenticated user and returns a safe DTO', async () => {
  const harness = createDbHarness();
  const [authenticatedUser, otherUser] = harness.users;
  const req = createRequest(harness.tokenFor(authenticatedUser));
  const requireAuth = createRequireAuth({
    db: harness.db,
    config,
    publicKey: keys.publicKey,
  });
  const authError = await runMiddleware(requireAuth, req);
  assert.equal(authError, undefined);

  req.body = { show_home_sell_banner: false };
  const handler = createUpdatePreferencesHandler({ db: harness.db });
  const { error, res } = await runHandler(handler, req);

  assert.equal(error, undefined);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.user.preferences, { show_home_sell_banner: false });
  assert.equal(res.body.user.password_hash, undefined);
  assert.equal(res.body.user.show_home_sell_banner, undefined);
  assert.equal(res.cookieWasSet, false);
  assert.equal(authenticatedUser.show_home_sell_banner, false);
  assert.equal(otherUser.show_home_sell_banner, true);

  const update = harness.calls.find(({ text }) => (
    /UPDATE identity\.users[\s\S]+SET show_home_sell_banner/i.test(text)
  ));
  assert.ok(update);
  assert.deepEqual(update.params, [authenticatedUser.id, false]);
  assert.match(update.text, /WHERE id = \$1/i);
  assert.equal(
    harness.calls.some(({ text }) => /UPDATE identity\.sessions/i.test(text)),
    false,
  );
  assert.equal(
    harness.calls.some(({ text }) => /message_outbox/i.test(text)),
    false,
  );
});

function createDbHarness() {
  const users = [createUser('one@example.com'), createUser('two@example.com')];
  const sessions = new Map(users.map((user) => [randomUUID(), user.id]));
  const calls = [];
  const db = {
    async query(text, params = []) {
      calls.push({ text, params });
      if (/FROM identity\.sessions AS s/i.test(text)) {
        const expectedUserId = sessions.get(params[0]);
        const user = users.find(({ id }) => id === params[1]);
        return { rows: expectedUserId === params[1] && user ? [{ ...user }] : [] };
      }
      if (/UPDATE identity\.users[\s\S]+SET show_home_sell_banner/i.test(text)) {
        const user = users.find(({ id }) => id === params[0]);
        if (!user?.is_active) return { rows: [] };
        user.show_home_sell_banner = params[1];
        return { rows: [{ ...user }] };
      }
      throw new Error(`Unexpected query in preference test: ${text}`);
    },
    async transaction() {
      throw new Error('Preference updates must not start a transaction');
    },
  };

  return {
    calls,
    db,
    users,
    tokenFor(user) {
      const sessionId = [...sessions].find(([, userId]) => userId === user.id)[0];
      return createSessionToken(user, {
        privateKey: keys.privateKey,
        issuer: config.JWT_ISSUER,
        audience: config.JWT_AUDIENCE,
        expiresIn: config.JWT_EXPIRES_IN,
      }, sessionId).token;
    },
  };
}

function createUser(email) {
  return {
    id: randomUUID(),
    email,
    full_name: `User ${email}`,
    password_hash: 'must-not-leak',
    auth_provider: 'email',
    role: 'cliente',
    phone: null,
    bio: null,
    is_active: true,
    created_at: new Date().toISOString(),
    show_home_sell_banner: true,
  };
}

function createRequest(token) {
  return {
    body: undefined,
    cookies: {},
    get(name) {
      if (name.toLowerCase() === 'authorization' && token) return `Bearer ${token}`;
      return undefined;
    },
  };
}

async function runMiddleware(middleware, req) {
  let error;
  await middleware(req, {}, (nextError) => {
    error = nextError;
  });
  return error;
}

async function runHandler(handler, req) {
  let error;
  const res = {
    body: undefined,
    cookieWasSet: false,
    statusCode: 200,
    cookie() {
      this.cookieWasSet = true;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  await handler(req, res, (nextError) => {
    error = nextError;
  });
  return { error, res };
}

function createKeys() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }),
  };
}
