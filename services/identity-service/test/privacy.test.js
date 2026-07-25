const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PRIVACY_CONFIRMATION,
  createPrivacyCoordinator,
} = require('../src/services/privacy');

const userId = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const correlationId = '33333333-3333-4333-8333-333333333333';

test('privacy export fans out to domains and excludes secrets from the response', async () => {
  const calls = [];
  const coordinator = createPrivacyCoordinator({
    db: {},
    config: {
      INTERNAL_SERVICE_TOKEN: 'server-internal-token-that-is-not-exported',
      CATALOG_SERVICE_URL: 'http://catalog:4002',
      CART_SERVICE_URL: 'http://cart:4003',
      ORDER_SERVICE_URL: 'http://order:4004',
      PAYMENT_SERVICE_URL: 'http://payment:4005',
      MODERATION_SERVICE_URL: 'http://moderation:4006',
    },
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return {
        ok: true,
        status: 200,
        async json() {
          return { data: { service: new URL(url).hostname } };
        },
      };
    },
    logger: { info() {}, warn() {} },
  });

  const result = await coordinator.exportUser({
    id: userId,
    email: 'person@example.com',
    full_name: 'Persona EcoBazar',
    role: 'cliente',
    auth_provider: 'email',
    phone: null,
    bio: null,
    avatar_url: null,
    is_active: true,
    created_at: new Date().toISOString(),
    show_home_sell_banner: true,
    password_hash: 'must-not-appear',
  }, correlationId);

  assert.equal(calls.length, 5);
  assert.ok(calls.every(({ options }) => options.headers['x-internal-token'].includes('server-internal')));
  assert.equal(result.schema_version, 1);
  assert.equal(result.user.email, 'person@example.com');
  assert.equal(result.domains.catalog.service, 'catalog');
  assert.ok(result.excluded.includes('password_hash'));
  assert.doesNotMatch(JSON.stringify(result), /server-internal-token|must-not-appear/);
  assert.ok(calls.every(({ options }) => options.headers['x-correlation-id'] === correlationId));
});

test('deletion requests are idempotent, deactivate the account and revoke sessions', async () => {
  const calls = [];
  const existing = [];
  const db = {
    async transaction(work) {
      return work({
        async query(sql, params = []) {
          calls.push({ sql, params });
          if (/SELECT id, status, created_at/i.test(sql)) return { rows: existing };
          if (/SELECT id, is_active/i.test(sql)) return { rows: [{ id: userId, is_active: true }] };
          if (/INSERT INTO identity\.privacy_requests/i.test(sql)) {
            const row = { id: requestId, status: 'pending', created_at: new Date() };
            existing.push(row);
            return { rows: [row] };
          }
          return { rows: [], rowCount: 1 };
        },
      });
    },
  };
  const coordinator = createPrivacyCoordinator({ db, logger: { info() {}, warn() {} } });

  const first = await coordinator.requestDeletion(userId, correlationId);
  const second = await coordinator.requestDeletion(userId, correlationId);

  assert.equal(PRIVACY_CONFIRMATION, 'ELIMINAR');
  assert.equal(first.id, requestId);
  assert.equal(second.id, requestId);
  assert.equal(calls.filter(({ sql }) => /INSERT INTO identity\.privacy_requests/i.test(sql)).length, 1);
  assert.equal(calls.filter(({ sql }) => /UPDATE identity\.users/i.test(sql)).length, 1);
  assert.equal(calls.filter(({ sql }) => /UPDATE identity\.sessions/i.test(sql)).length, 1);
});

test('failed domain deletion is persisted as a retryable safe reason', async () => {
  const calls = [];
  const request = {
    id: requestId,
    user_id: userId,
    correlation_id: correlationId,
    attempts: 1,
  };
  const db = {
    async transaction(work) {
      return work({
        async query(sql, params = []) {
          calls.push({ sql, params });
          if (/SELECT id, user_id, correlation_id/i.test(sql)) return { rows: [request] };
          if (/UPDATE identity\.privacy_requests[\s\S]+status = 'processing'/i.test(sql)) {
            return { rows: [{ ...request, attempts: 2 }] };
          }
          return { rows: [], rowCount: 1 };
        },
      });
    },
    async query(sql, params = []) {
      calls.push({ sql, params });
      return { rows: [], rowCount: 1 };
    },
  };
  const coordinator = createPrivacyCoordinator({
    db,
    config: {
      INTERNAL_SERVICE_TOKEN: 'server-internal-token-that-is-not-exported',
      CATALOG_SERVICE_URL: 'http://catalog:4002',
    },
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      async json() { return { error: 'do-not-persist-response-body' }; },
    }),
    logger: { info() {}, warn() {} },
  });

  assert.equal(await coordinator.processNextDeletion(), true);
  const failure = calls.find(({ sql }) => /SET status = 'failed'/i.test(sql));
  assert.ok(failure);
  assert.equal(failure.params[1], 'PRIVACY_SERVICE_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(calls.map(({ params }) => params)), /do-not-persist-response-body|server-internal-token/);
});
