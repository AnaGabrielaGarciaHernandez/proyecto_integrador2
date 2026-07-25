const test = require('node:test');
const assert = require('node:assert/strict');
const { createInternalRouter } = require('../src/http/internal');

test('sales report returns filtered pages, complete movements and global sales context', async () => {
  const calls = [];
  const db = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/COALESCE\(\s*SUM\(total_cents\)/i.test(sql)) {
        return {
          rows: [{
            total_sales_cents: '12500',
            paid_orders_count: 2,
            cancelled_orders_count: 1,
          }],
        };
      }
      if (/SELECT count\(\*\)::integer AS total/i.test(sql)) {
        return { rows: [{ total: 51 }] };
      }
      const movement = {
          id: '11111111-1111-4111-8111-111111111111',
          order_number: 'ECO-2026-000001',
          buyer_id: '22222222-2222-4222-8222-222222222222',
          buyer_name: 'Ana Compradora',
          status: 'delivered',
          payment_status: 'succeeded',
          total_cents: 12500,
          item_count: 1,
          sellers: [{ user_id: '33333333-3333-4333-8333-333333333333', name: 'Tienda Verde' }],
          items: [{ product_name: 'Camisa', seller_name: 'Tienda Verde', quantity: 1 }],
      };
      return { rows: Array.from({ length: 25 }, () => movement) };
    },
  };
  const handler = getSalesHandler(db);
  let response;
  await handler(
    { query: { search: 'tienda verde', limit: '25', offset: '25' } },
    { json(value) { response = value; } },
    (error) => { throw error; },
  );

  assert.equal(response.total_sales_cents, 12500);
  assert.equal(response.paid_orders_count, 2);
  assert.equal(response.cancelled_orders_count, 1);
  assert.equal(response.total, 51);
  assert.deepEqual(response.pagination, { limit: 25, offset: 25, has_more: true });
  assert.equal(response.movements[0].sellers[0].name, 'Tienda Verde');
  assert.equal(response.movements[0].items[0].product_name, 'Camisa');
  assert.match(calls[1].sql, /lower\(o\.id::text\) LIKE lower\(\$2\)/);
  assert.match(calls[1].sql, /oi_search\.seller_name/);
  assert.match(calls[1].sql, /LIMIT \$3 OFFSET \$4/);
  assert.deepEqual(calls[1].params, ['tienda verde', '%tienda verde%', 25, 25]);
});

test('sales report rejects limits above the supported maximum', async () => {
  const handler = getSalesHandler({
    async query() {
      throw new Error('The database should not be queried for invalid input');
    },
  });
  let received;
  await handler(
    { query: { limit: '101', offset: '0', search: '' } },
    { json() {} },
    (error) => { received = error; },
  );

  assert.equal(received.status, 400);
});

function getSalesHandler(db) {
  const router = createInternalRouter({ db, internalToken: 'test-internal-token' });
  const layer = router.stack.find((entry) => entry.route?.path === '/reports/sales');
  return layer.route.stack[0].handle;
}
