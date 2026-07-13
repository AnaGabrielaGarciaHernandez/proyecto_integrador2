const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://localhost:5432/bd_EcoBazar_test';
process.env.JWT_SECRET ||= 'test_secret_that_is_long_enough';
process.env.CLIENT_ORIGIN ||= 'http://localhost:5173';

const { getBuyerOrder, getSellerOrder } = require('../src/services/orders.service');

test('buyer detail returns 404 when the order does not belong to the buyer', async () => {
  let captured;
  const dbQuery = async (sql, params) => {
    captured = { sql, params };
    return { rows: [] };
  };

  await assert.rejects(
    getBuyerOrder('order-1', 'buyer-2', dbQuery),
    (error) => error.status === 404,
  );
  assert.match(captured.sql, /o\.id = \$1 AND o\.buyer_id = \$2/);
  assert.deepEqual(captured.params, ['order-1', 'buyer-2']);
});

test('seller detail scopes items and total to the authenticated seller profile', async () => {
  const statements = [];
  const dbQuery = async (sql, params) => {
    statements.push({ sql, params });
    if (/FROM seller_profiles/.test(sql)) return { rows: [{ id: 'seller-1' }] };
    return {
      rows: [{
        id: 'order-1',
        order_number: 'ECO-2026-000001',
        status: 'paid',
        currency: 'MXN',
        seller_total_cents: 25000,
        items: [{
          id: 'item-1', seller_id: 'seller-1', quantity: 2,
          unit_price_cents: 12500, total_cents: 25000,
        }],
      }],
    };
  };

  const order = await getSellerOrder('order-1', 'seller-user-1', dbQuery);
  const detailQuery = statements[1];
  assert.match(detailQuery.sql, /oi\.seller_id = \$2/);
  assert.match(detailQuery.sql, /sum\(oi\.total_cents\)::integer AS seller_total_cents/);
  assert.deepEqual(detailQuery.params, ['order-1', 'seller-1']);
  assert.equal(order.seller_total_cents, 25000);
  assert.equal(order.items.length, 1);
  assert.equal(order.items[0].seller_id, 'seller-1');
  assert.equal(order.total_cents, undefined);
});
