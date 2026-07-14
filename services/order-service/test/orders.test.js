const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === '@ecobazar/platform') {
    return {
      createHttpError(message, status, details) {
        return Object.assign(new Error(message), { status, details });
      },
    };
  }
  return originalLoad(request, parent, isMain);
};
const { createOrdersRepository, validateCart } = require('../src/repositories/orders');
Module._load = originalLoad;

test('empty and mixed-currency carts are rejected with stable codes', () => {
  assert.throws(
    () => validateCart({ buyer_id: 'buyer', items: [] }, 'buyer'),
    (error) => error.details.code === 'CART_EMPTY',
  );
  assert.throws(
    () => validateCart({ buyer_id: 'buyer', items: [{ currency: 'MXN' }, { currency: 'USD' }] }, 'buyer'),
    (error) => error.details.code === 'MIXED_CURRENCY',
  );
});

test('seller detail filters both items and subtotal by seller_user_id', async () => {
  let captured;
  const db = {
    async query(sql, params) {
      captured = { sql, params };
      return { rows: [] };
    },
  };
  const repository = createOrdersRepository(db);
  await assert.rejects(
    repository.getSellerOrder('order-1', 'seller-user-1'),
    (error) => error.status === 404,
  );
  assert.match(captured.sql, /oi\.seller_user_id = \$2/);
  assert.match(captured.sql, /sum\(oi\.total_cents\)::integer AS seller_total_cents/);
  assert.deepEqual(captured.params, ['order-1', 'seller-user-1']);
});

test('compensation uses compensating first and only workers retry durable pending states', async () => {
  const statements = [];
  const db = {
    async query(sql, params) {
      statements.push({ sql, params });
      if (/SELECT o\.id, s\.correlation_id/.test(sql)) return { rows: [] };
      return { rows: [] };
    },
  };
  const repository = createOrdersRepository(db);
  await repository.stageCompensation('order-1', 'cancelled', 'correlation-1');
  await repository.listPendingCompensations();

  assert.match(statements[0].sql, /status = 'compensating'/);
  assert.match(statements[1].sql, /IN \('compensating', 'compensation_pending'\)/);
});
