const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { listProducts, getProduct, resolveVariants } = require('../src/services/products');

const PRODUCT_ID = '10000000-0000-4000-8000-000000000001';
const BUYER_ID = '20000000-0000-4000-8000-000000000001';
const VARIANT_ID = '30000000-0000-4000-8000-000000000001';

test('listProducts publishes available and temporarily unavailable products only', async () => {
  let statement;
  const expected = [{
    id: PRODUCT_ID,
    total_stock: 0,
    availability_status: 'temporarily_unavailable',
  }];
  const db = {
    async query(sql, params) {
      statement = { sql, params };
      return { rows: expected };
    },
  };

  const products = await listProducts(db, { limit: 24, offset: 0 });

  assert.equal(products, expected);
  assert.equal(statement.params[0], 'active');
  assert.match(statement.sql, /p\.status = \$1/);
  assertSellerQuery(statement.sql);
  assertAvailabilityQuery(statement.sql);
  assert.match(
    statement.sql,
    /COALESCE\(variants\.total_stock, 0\) > 0\s+OR COALESCE\(active_reservation\.has_active_reservation, false\)/,
  );
});

test('getProduct applies availability rules and returns its public status', async () => {
  let sql;
  const expected = {
    id: PRODUCT_ID,
    total_stock: 2,
    availability_status: 'available',
  };
  const db = {
    async query(receivedSql) {
      sql = receivedSql;
      return { rows: [expected] };
    },
  };

  const product = await getProduct(db, PRODUCT_ID);

  assert.equal(product, expected);
  assert.match(sql, /p\.id = \$1\s+AND p\.status = 'active'/);
  assertSellerQuery(sql);
  assertAvailabilityQuery(sql);
  assert.match(
    sql,
    /AND \(\s+COALESCE\(variants\.total_stock, 0\) > 0\s+OR COALESCE\(active_reservation\.has_active_reservation, false\)\s+\)/,
  );
});

test('getProduct returns 404 when no active, publishable inventory exists', async () => {
  const db = { query: async () => ({ rows: [] }) };

  await assert.rejects(
    getProduct(db, PRODUCT_ID),
    (error) => error.status === 404 && error.message === 'Product not found',
  );
});

test('resolveVariants includes only the active reservation owned by the buyer', async () => {
  let statement;
  const db = {
    async query(sql, params) {
      statement = { sql, params };
      return {
        rows: [{
          variant_id: VARIANT_ID,
          stock: 0,
          buyer_reserved_quantity: 2,
        }],
      };
    },
  };

  const variants = await resolveVariants(db, [VARIANT_ID], BUYER_ID);

  assert.equal(variants[0].buyer_reserved_quantity, 2);
  assert.deepEqual(statement.params, [[VARIANT_ID], BUYER_ID]);
  assert.match(statement.sql, /reservation\.buyer_id = \$2::uuid/);
  assert.match(statement.sql, /reservation\.status = 'active'/);
  assert.match(statement.sql, /AS buyer_reserved_quantity/);
});

test('availability migration indexes reservation items by product and order', () => {
  const migration = fs.readFileSync(
    path.resolve(__dirname, '../migrations/003_catalog_product_availability.sql'),
    'utf8',
  );

  assert.match(
    migration,
    /CREATE INDEX inventory_reservation_items_product_order_idx\s+ON inventory_reservation_items \(product_id, order_id\)/,
  );
});

function assertAvailabilityQuery(sql) {
  assert.match(
    sql,
    /WHEN COALESCE\(variants\.total_stock, 0\) > 0 THEN 'available'/,
  );
  assert.match(
    sql,
    /WHEN COALESCE\(active_reservation\.has_active_reservation, false\)\s+THEN 'temporarily_unavailable'/,
  );
  assert.match(sql, /JOIN inventory_reservations reservation/);
  assert.match(sql, /reservation\.status = 'active'/);
}

function assertSellerQuery(sql) {
  assert.match(sql, /JOIN user_role_projection ur ON ur\.user_id = sp\.user_id/);
  assert.match(sql, /sp\.status = 'approved'/);
  assert.match(sql, /ur\.role = 'vendedor'/);
  assert.match(sql, /ur\.is_active IS TRUE/);
}
