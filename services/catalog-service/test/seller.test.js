const test = require('node:test');
const assert = require('node:assert/strict');
const { requireSeller, sellerPending } = require('../src/routes/seller');

const USER_ID = '11111111-1111-4111-8111-111111111111';

test('seller placeholders preserve authentication and role checks', () => {
  assert.equal(run({}), 401);
  assert.equal(run({ 'x-user-id': USER_ID, 'x-user-role': 'cliente' }), 403);
  assert.equal(run({ 'x-user-id': USER_ID, 'x-user-role': 'vendedor' }), 'next');
  assert.equal(run({ 'x-user-id': USER_ID, 'x-user-role': 'admin' }), 'next');
});

test('seller placeholder remains explicit after successful authorization', () => {
  let error;
  sellerPending({}, {}, (received) => { error = received; });
  assert.equal(error.status, 501);
  assert.equal(error.message, 'Seller endpoints are not implemented yet');
});

function run(headers) {
  let outcome;
  const req = {
    get(name) { return headers[name.toLowerCase()]; },
  };
  requireSeller(req, {}, (error) => { outcome = error?.status || 'next'; });
  return outcome;
}
