const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePickupSchedules, updateSellerProduct } = require('../src/services/seller-products');
const { normalizePickupPoint } = require('../src/services/pickup-points');
const { productSelect } = require('../src/services/products');

test('pickup point validation trims fields and keeps optional references nullable', () => {
  assert.deepEqual(normalizePickupPoint({
    name: ' Centro ',
    address_line: ' Calle 1 #2 ',
    city: ' Durango ',
    state: ' Durango ',
    postal_code: ' 34000 ',
  }), {
    name: 'Centro',
    address_line: 'Calle 1 #2',
    city: 'Durango',
    state: 'Durango',
    postal_code: '34000',
    reference: null,
  });
});

test('pickup schedules reject duplicates and overnight blocks', () => {
  assert.deepEqual(normalizePickupSchedules([
    { day_of_week: 1, start_time: '09:00:00', end_time: '12:00' },
  ]), [{ dayOfWeek: 1, startTime: '09:00', endTime: '12:00' }]);
  assert.throws(
    () => normalizePickupSchedules([
      { day_of_week: 1, start_time: '09:00', end_time: '12:00' },
      { day_of_week: 1, start_time: '09:00', end_time: '12:00' },
    ]),
    (error) => error.details.code === 'PICKUP_SCHEDULES_INVALID',
  );
  assert.throws(
    () => normalizePickupSchedules([{ day_of_week: 1, start_time: '18:00', end_time: '08:00' }]),
    (error) => error.details.code === 'PICKUP_SCHEDULES_INVALID',
  );
});

test('public product selection omits exact pickup addresses', () => {
  assert.doesNotMatch(productSelect(), /address_line/);
  assert.match(productSelect({ includePickupAddress: true }), /address_line/);
});

test('editing a legacy product assigns its pickup point before inserting schedules', async () => {
  const productId = '10000000-0000-4000-8000-000000000001';
  const sellerId = '20000000-0000-4000-8000-000000000001';
  const userId = '30000000-0000-4000-8000-000000000001';
  const pointId = '40000000-0000-4000-8000-000000000001';
  const events = [];
  const product = {
    id: productId,
    seller_id: sellerId,
    status: 'active',
    pickup_point_id: null,
  };
  const client = {
    async query(sql, params) {
      if (sql.includes('SELECT sp.id, sp.user_id, sp.display_name')) {
        return { rows: [{ id: sellerId, user_id: userId, display_name: 'Vendedor' }] };
      }
      if (sql.includes('FOR UPDATE')) return { rows: [product] };
      if (sql.includes('FROM seller_pickup_points')) return { rows: [{ id: pointId }] };
      if (sql.startsWith('UPDATE products SET')) {
        events.push('product-update');
        return { rows: [] };
      }
      if (sql.startsWith('DELETE FROM product_pickup_schedules')) {
        events.push('schedule-delete');
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO product_pickup_schedules')) {
        events.push('schedule-insert');
        assert.deepEqual(params, [productId, 1, '10:00', '14:00', 'America/Monterrey']);
        return { rows: [] };
      }
      if (sql.includes('WHERE p.id = $1 AND sp.user_id = $2')) {
        return { rows: [{ ...product, pickup_point_id: pointId }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const db = {
    transaction(callback) {
      return callback(client);
    },
  };

  await updateSellerProduct(db, { id: userId, role: 'vendedor' }, productId, {
    pickup_point_id: pointId,
    pickup_schedules: [{ day_of_week: 1, start_time: '10:00', end_time: '14:00' }],
  });

  assert.deepEqual(events, ['product-update', 'schedule-delete', 'schedule-insert']);
});
