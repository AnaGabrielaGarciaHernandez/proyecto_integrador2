const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, randomUUID } = require('node:crypto');
const multer = require('multer');
const { createRequireAuth } = require('../src/middleware/auth');
const {
  createUpdatePreferencesHandler,
  createUpdateProfileHandler,
  normalizeMultipartError,
} = require('../src/routes/auth.routes');
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

test('profile handler preserves the current avatar when no new avatar is submitted', async () => {
  const harness = createDbHarness();
  const user = harness.users[0];
  const handler = createUpdateProfileHandler({ db: harness.db });

  const { error, res } = await runHandler(handler, {
    body: { full_name: 'Nombre actualizado' },
    user,
  });

  assert.equal(error, undefined);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.user.full_name, 'Nombre actualizado');
  assert.equal(res.body.user.avatar_url, user.avatar_url);
  assert.deepEqual(
    harness.calls.at(-1).params,
    [user.id, 'Nombre actualizado'],
  );
  assert.doesNotMatch(harness.calls.at(-1).text, /avatar_url\s*=/i);
});

test('profile handler stores the URL returned by avatar storage for a multipart file', async () => {
  const harness = createDbHarness();
  const user = harness.users[0];
  const uploaded = [];
  const removed = [];
  const avatarUrl = 'https://project.supabase.co/storage/v1/object/public/avatars/avatars/'
    + `${user.id}/new-avatar.webp`;
  const handler = createUpdateProfileHandler({
    db: harness.db,
    processAvatar: async (file) => {
      assert.equal(file.mimetype, 'image/jpeg');
      return { buffer: Buffer.from('normalized-webp') };
    },
    avatarStorage: {
      async uploadAvatar(input) {
        uploaded.push(input);
        return { path: `avatars/${user.id}/new-avatar.webp`, publicUrl: avatarUrl };
      },
      async deleteOwnedAvatar(url, userId) {
        removed.push({ url, userId });
      },
      async deleteAvatar(path) {
        removed.push({ path });
      },
    },
  });

  const { error, res } = await runHandler(handler, {
    body: { full_name: user.full_name },
    user,
    file: { mimetype: 'image/jpeg', buffer: Buffer.from('original') },
  });

  assert.equal(error, undefined);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.user.avatar_url, avatarUrl);
  assert.deepEqual(uploaded, [{ userId: user.id, buffer: Buffer.from('normalized-webp') }]);
  assert.deepEqual(removed, [{ url: user.avatar_url, userId: user.id }]);
  assert.deepEqual(
    harness.calls.at(-1).params,
    [user.id, user.full_name, avatarUrl],
  );
});

test('profile handler removes a newly uploaded avatar when the database update fails', async () => {
  const harness = createDbHarness();
  const user = harness.users[0];
  const removed = [];
  harness.db.failProfileUpdate = true;
  const handler = createUpdateProfileHandler({
    db: harness.db,
    processAvatar: async () => ({ buffer: Buffer.from('normalized-webp') }),
    avatarStorage: {
      async uploadAvatar() {
        return { path: `avatars/${user.id}/new-avatar.webp`, publicUrl: 'https://supabase.test/new' };
      },
      async deleteAvatar(path) {
        removed.push(path);
      },
    },
  });

  const { error } = await runHandler(handler, {
    body: { full_name: user.full_name },
    user,
    file: { mimetype: 'image/png', buffer: Buffer.from('original') },
  });

  assert.match(error.message, /database update failed/i);
  assert.deepEqual(removed, [`avatars/${user.id}/new-avatar.webp`]);
});

test('multipart errors expose a safe reason for the rejected shape', () => {
  const unexpectedField = normalizeMultipartError(
    new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'avatar_url'),
  );
  assert.equal(unexpectedField.status, 400);
  assert.equal(unexpectedField.message, 'El archivo debe enviarse en el campo avatar.');
  assert.equal(unexpectedField.details.code, 'AVATAR_MULTIPART_FILE_INVALID');

  const tooManyParts = normalizeMultipartError(new multer.MulterError('LIMIT_PART_COUNT'));
  assert.equal(tooManyParts.message, 'La petición de avatar solo puede contener full_name y un archivo avatar.');
  assert.equal(tooManyParts.details.code, 'AVATAR_MULTIPART_PART_COUNT');
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
      if (/UPDATE identity\.users[\s\S]+SET full_name/i.test(text)) {
        if (this.failProfileUpdate) throw new Error('Database update failed');
        const user = users.find(({ id }) => id === params[0]);
        if (!user?.is_active) return { rows: [] };
        user.full_name = params[1];
        if (params.length === 3) user.avatar_url = params[2];
        return { rows: [{ ...user }] };
      }
      throw new Error(`Unexpected query in preference test: ${text}`);
    },
    async transaction() {
      throw new Error('Preference updates must not start a transaction');
    },
  };

  db.failProfileUpdate = false;

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
    avatar_url: 'https://example.com/current-avatar.jpg',
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
