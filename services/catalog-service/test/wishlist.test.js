const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { requireWishlistUser } = require('../src/routes/wishlist');
const {
  addWishlistItem,
  listWishlist,
  removeWishlistItem,
} = require('../src/services/wishlist');

const USER_ID = '10000000-0000-4000-8000-000000000001';
const PRODUCT_ID = '20000000-0000-4000-8000-000000000001';

test('wishlist migration is account-scoped, unique, indexed, and cascades products', () => {
  const migration = fs.readFileSync(
    path.resolve(__dirname, '../migrations/004_catalog_wishlist.sql'),
    'utf8',
  );
  assert.match(migration, /PRIMARY KEY \(user_id, product_id\)/);
  assert.match(migration, /REFERENCES products\(id\) ON DELETE CASCADE/);
  assert.match(migration, /wishlist_items \(user_id, created_at DESC\)/);
  assert.doesNotMatch(migration, /user_id uuid[^,]*REFERENCES/);
});

test('wishlist authorization permits customers and sellers but excludes guests and admins', () => {
  assert.equal(runAuth({}), 401);
  assert.equal(runAuth({ 'x-user-id': USER_ID, 'x-user-role': 'cliente' }), 'next');
  assert.equal(runAuth({ 'x-user-id': USER_ID, 'x-user-role': 'vendedor' }), 'next');
  assert.equal(runAuth({ 'x-user-id': USER_ID, 'x-user-role': 'admin' }), 403);
});

test('wishlist listing is isolated by account, newest first, visible-only, and paginated', async () => {
  let statement;
  const db = {
    async query(sql, params) {
      statement = { sql, params };
      return {
        rows: [{
          products: [{ id: PRODUCT_ID, is_wishlisted: true }],
          total: 7,
        }],
      };
    },
  };
  const result = await listWishlist(db, USER_ID, { limit: 2, offset: 4 });
  assert.equal(result.total, 7);
  assert.equal(result.products[0].id, PRODUCT_ID);
  assert.deepEqual(statement.params, [USER_ID, 2, 4]);
  assert.match(statement.sql, /wi\.user_id = \$1/);
  assert.match(statement.sql, /p\.status = 'active'/);
  assert.match(statement.sql, /sp\.status = 'approved'/);
  assert.match(statement.sql, /reservation\.status = 'active'/);
  assert.match(statement.sql, /ORDER BY wishlisted_at DESC/);
});

test('saving is idempotent under duplicate requests and accepts reserved sold-out products', async () => {
  const statements = [];
  const createdAt = new Date('2030-01-01T00:00:00.000Z');
  const client = {
    async query(sql, params) {
      statements.push({ sql, params });
      if (/SELECT p\.id/.test(sql)) return { rows: [{ id: PRODUCT_ID }] };
      return { rows: [{ product_id: PRODUCT_ID, created_at: createdAt }] };
    },
  };
  const db = { transaction: (work) => work(client) };
  const first = await addWishlistItem(db, USER_ID, PRODUCT_ID);
  const second = await addWishlistItem(db, USER_ID, PRODUCT_ID);
  assert.equal(first.product_id, PRODUCT_ID);
  assert.equal(second.created_at, createdAt);
  const insert = statements.find(({ sql }) => /INSERT INTO wishlist_items/.test(sql));
  assert.match(insert.sql, /ON CONFLICT \(user_id, product_id\) DO UPDATE/);
  assert.match(statements[0].sql, /has_active_reservation/);
  assert.match(statements[0].sql, /COALESCE\(active_reservation\.has_active_reservation, false\)/);
});

test('saving sanitizes an unavailable product as PRODUCT_UNAVAILABLE', async () => {
  const db = {
    transaction: (work) => work({ query: async () => ({ rows: [] }) }),
  };
  await assert.rejects(
    addWishlistItem(db, USER_ID, PRODUCT_ID),
    (error) => error.status === 404
      && error.details.code === 'PRODUCT_UNAVAILABLE'
      && !/sql|query|relation/i.test(error.message),
  );
});

test('deleting is idempotent and account-scoped', async () => {
  const calls = [];
  const db = { query: async (sql, params) => calls.push({ sql, params }) };
  await removeWishlistItem(db, USER_ID, PRODUCT_ID);
  await removeWishlistItem(db, USER_ID, PRODUCT_ID);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].params, [USER_ID, PRODUCT_ID]);
  assert.match(calls[0].sql, /user_id = \$1 AND product_id = \$2/);
});

function runAuth(headers) {
  const req = {
    get(name) {
      return headers[name];
    },
  };
  let result = 'next';
  requireWishlistUser(req, {}, (error) => {
    if (error) result = error.status;
  });
  return result;
}
