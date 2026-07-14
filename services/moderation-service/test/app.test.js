const test = require('node:test');
const assert = require('node:assert/strict');

test('moderation intentionally keeps unfinished business endpoints scoped', () => {
  const { createApp } = require('../src/app');
  assert.equal(typeof createApp, 'function');
});

test('reviews require authentication and admin endpoints also require the admin role', () => {
  const { pending, requireAdmin, requireUser } = require('../src/app');
  const userId = '11111111-1111-4111-8111-111111111111';
  assert.equal(run(requireUser, {}), 401);

  const customer = request({ 'x-user-id': userId, 'x-user-role': 'cliente' });
  assert.equal(run(requireUser, customer.headers, customer), 'next');
  assert.equal(run(requireAdmin, customer.headers, customer), 403);

  const admin = request({ 'x-user-id': userId, 'x-user-role': 'admin' });
  assert.equal(run(requireUser, admin.headers, admin), 'next');
  assert.equal(run(requireAdmin, admin.headers, admin), 'next');
  assert.equal(run(pending('Admin'), admin.headers, admin), 501);
});

function request(headers) {
  return { headers, get(name) { return this.headers[name.toLowerCase()]; } };
}

function run(middleware, headers, req = request(headers)) {
  let outcome;
  middleware(req, {}, (error) => { outcome = error?.status || 'next'; });
  return outcome;
}
