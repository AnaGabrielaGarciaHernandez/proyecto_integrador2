const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeItems,
  reservationFingerprint,
  reserveInventory,
  confirmInventoryWithClient,
  confirmPaidOrderWithClient,
  releaseInventory,
  releaseInventoryWithClient,
} = require('../src/services/inventory');

const ORDER_ID = '10000000-0000-4000-8000-000000000001';
const BUYER_ID = '20000000-0000-4000-8000-000000000001';
const VARIANT_A = '30000000-0000-4000-8000-000000000001';
const VARIANT_B = '30000000-0000-4000-8000-000000000002';

test('normalizeItems aggregates duplicate variants and produces a stable fingerprint', () => {
  const left = normalizeItems([
    { variant_id: VARIANT_B, quantity: 1 },
    { variant_id: VARIANT_A, quantity: 2 },
    { variant_id: VARIANT_B, quantity: 3 },
  ]);
  assert.deepEqual(left, [
    { variant_id: VARIANT_A, quantity: 2 },
    { variant_id: VARIANT_B, quantity: 4 },
  ]);
  assert.equal(
    reservationFingerprint({ buyer_id: BUYER_ID, items: left }),
    reservationFingerprint({
      buyer_id: BUYER_ID,
      items: [...left].reverse(),
    }),
  );
});

test('reserveInventory locks variants, subtracts stock, and returns enriched snapshots', async () => {
  const statements = [];
  const variants = [variantRow(VARIANT_A, 3), variantRow(VARIANT_B, 8)];
  const client = {
    async query(sql, params = []) {
      statements.push({ sql, params });
      if (/SELECT request_fingerprint/.test(sql)) return { rows: [] };
      if (/FROM product_variants pv/.test(sql)) return { rows: variants };
      if (/SELECT order_id, buyer_id, status/.test(sql)) {
        return { rows: [{
          order_id: ORDER_ID,
          buyer_id: BUYER_ID,
          status: 'active',
          expires_at: new Date('2030-01-01T00:30:00.000Z'),
        }] };
      }
      if (/FROM inventory_reservation_items/.test(sql)) {
        return { rows: variants.map((row, index) => ({ ...row, quantity: index + 1 })) };
      }
      return { rows: [] };
    },
  };
  const db = { transaction: (work) => work(client) };

  const reservation = await reserveInventory(db, {
    order_id: ORDER_ID,
    buyer_id: BUYER_ID,
    expires_at: '2030-01-01T00:30:00.000Z',
    items: [
      { variant_id: VARIANT_B, quantity: 2 },
      { variant_id: VARIANT_A, quantity: 1 },
    ],
  }, '40000000-0000-4000-8000-000000000001');

  assert.equal(reservation.status, 'active');
  assert.equal(reservation.items.length, 2);
  assert.equal(statements.filter(({ sql }) => /UPDATE product_variants SET stock = stock -/.test(sql)).length, 2);
  assert.equal(statements.filter(({ sql }) => /INSERT INTO inventory_reservation_items/.test(sql)).length, 2);
});

test('reserveInventory rejects insufficient stock before making inventory writes', async () => {
  const statements = [];
  const client = {
    async query(sql, params = []) {
      statements.push({ sql, params });
      if (/SELECT request_fingerprint/.test(sql)) return { rows: [] };
      if (/FROM product_variants pv/.test(sql)) return { rows: [variantRow(VARIANT_A, 1)] };
      return { rows: [] };
    },
  };

  await assert.rejects(
    reserveInventory({ transaction: (work) => work(client) }, {
      order_id: ORDER_ID,
      buyer_id: BUYER_ID,
      expires_at: '2030-01-01T00:30:00.000Z',
      items: [{ variant_id: VARIANT_A, quantity: 2 }],
    }, '40000000-0000-4000-8000-000000000001'),
    (error) => error.status === 409 && error.details.code === 'STOCK_UNAVAILABLE',
  );
  assert.equal(statements.some(({ sql }) => /UPDATE product_variants SET stock = stock -/.test(sql)), false);
});

test('reserveInventory reuses the same order reservation without touching stock twice', async () => {
  const input = {
    order_id: ORDER_ID,
    buyer_id: BUYER_ID,
    expires_at: '2030-01-01T00:30:00.000Z',
    items: [{ variant_id: VARIANT_A, quantity: 1 }],
  };
  const statements = [];
  const client = {
    async query(sql, params = []) {
      statements.push({ sql, params });
      if (/SELECT request_fingerprint/.test(sql)) {
        return { rows: [{ request_fingerprint: reservationFingerprint(input) }] };
      }
      if (/SELECT order_id, buyer_id, status/.test(sql)) {
        return { rows: [{ order_id: ORDER_ID, buyer_id: BUYER_ID, status: 'active' }] };
      }
      if (/FROM inventory_reservation_items/.test(sql)) return { rows: [] };
      return { rows: [] };
    },
  };
  const reservation = await reserveInventory(
    { transaction: (work) => work(client) },
    input,
    '40000000-0000-4000-8000-000000000001',
  );
  assert.equal(reservation.status, 'active');
  assert.equal(statements.some(({ sql }) => /FROM product_variants pv/.test(sql)), false);
  assert.equal(statements.some(({ sql }) => /SET stock = stock -/.test(sql)), false);
});

test('releaseInventoryWithClient restores stock only on the first active transition', async () => {
  let status = 'active';
  let restorations = 0;
  const client = {
    async query(sql) {
      if (/SELECT status FROM inventory_reservations/.test(sql)) return { rows: [{ status }] };
      if (/SET stock = pv.stock \+/.test(sql)) {
        restorations += 1;
        return { rows: [] };
      }
      if (/SET status = 'released'/.test(sql)) {
        status = 'released';
        return { rows: [] };
      }
      if (/SELECT order_id, buyer_id, status/.test(sql)) {
        return { rows: [{ order_id: ORDER_ID, buyer_id: BUYER_ID, status }] };
      }
      if (/FROM inventory_reservation_items/.test(sql)) return { rows: [] };
      return { rows: [] };
    },
  };

  await releaseInventoryWithClient(client, ORDER_ID, '40000000-0000-4000-8000-000000000001');
  await releaseInventoryWithClient(client, ORDER_ID, '40000000-0000-4000-8000-000000000001');
  assert.equal(status, 'released');
  assert.equal(restorations, 1);
});

test('releaseInventory is a terminal no-op when reservation creation never completed', async () => {
  const client = {
    async query(sql) {
      if (/SELECT status FROM inventory_reservations/.test(sql)) return { rows: [] };
      return { rows: [] };
    },
  };
  const reservation = await releaseInventory(
    { transaction: (work) => work(client) },
    ORDER_ID,
    '40000000-0000-4000-8000-000000000001',
  );
  assert.deepEqual(reservation, {
    order_id: ORDER_ID,
    status: 'released',
    not_found: true,
    items: [],
  });
});

test('confirmInventoryWithClient is idempotent and never changes reserved stock', async () => {
  let status = 'active';
  let confirmations = 0;
  const statements = [];
  const client = {
    async query(sql) {
      statements.push(sql);
      if (/SELECT status FROM inventory_reservations/.test(sql)) return { rows: [{ status }] };
      if (/SET status = 'confirmed'/.test(sql)) {
        status = 'confirmed';
        confirmations += 1;
        return { rows: [] };
      }
      if (/SELECT order_id, buyer_id, status/.test(sql)) {
        return { rows: [{ order_id: ORDER_ID, buyer_id: BUYER_ID, status }] };
      }
      if (/FROM inventory_reservation_items/.test(sql)) return { rows: [] };
      return { rows: [] };
    },
  };
  await confirmInventoryWithClient(client, ORDER_ID, '40000000-0000-4000-8000-000000000001');
  await confirmInventoryWithClient(client, ORDER_ID, '40000000-0000-4000-8000-000000000001');
  assert.equal(status, 'confirmed');
  assert.equal(confirmations, 1);
  assert.equal(statements.some((sql) => /SET stock/.test(sql)), false);
});

test('paid orders confirm inventory and remove only the buyer wishlist rows from before the event', async () => {
  let status = 'active';
  const deletions = [];
  const occurredAt = '2030-01-01T00:00:00.000Z';
  const client = {
    async query(sql, params = []) {
      if (/SELECT buyer_id FROM inventory_reservations/.test(sql)) {
        return { rows: [{ buyer_id: BUYER_ID }] };
      }
      if (/SELECT status FROM inventory_reservations/.test(sql)) return { rows: [{ status }] };
      if (/SET status = 'confirmed'/.test(sql)) {
        status = 'confirmed';
        return { rows: [] };
      }
      if (/SELECT order_id, buyer_id, status/.test(sql)) {
        return { rows: [{ order_id: ORDER_ID, buyer_id: BUYER_ID, status }] };
      }
      if (/FROM inventory_reservation_items/.test(sql) && !/DELETE FROM/.test(sql)) {
        return { rows: [
          { variant_id: VARIANT_A, product_id: '50000000-0000-4000-8000-000000000001' },
          { variant_id: VARIANT_B, product_id: '50000000-0000-4000-8000-000000000001' },
        ] };
      }
      if (/DELETE FROM wishlist_items/.test(sql)) {
        deletions.push({ sql, params });
        return { rows: [] };
      }
      return { rows: [] };
    },
  };

  await confirmPaidOrderWithClient(client, {
    orderId: ORDER_ID,
    buyerId: BUYER_ID,
    occurredAt,
    correlationId: '40000000-0000-4000-8000-000000000001',
  });
  await confirmPaidOrderWithClient(client, {
    orderId: ORDER_ID,
    buyerId: BUYER_ID,
    occurredAt,
    correlationId: '40000000-0000-4000-8000-000000000001',
  });

  assert.equal(status, 'confirmed');
  assert.equal(deletions.length, 2);
  assert.deepEqual(deletions[0].params, [ORDER_ID, BUYER_ID, occurredAt]);
  assert.match(deletions[0].sql, /SELECT DISTINCT product_id/);
  assert.match(deletions[0].sql, /wish\.user_id = \$2/);
  assert.match(deletions[0].sql, /wish\.created_at <= \$3::timestamptz/);
});

test('paid order rejects a buyer that does not own the stored reservation', async () => {
  let changed = false;
  const client = {
    async query(sql) {
      if (/SELECT buyer_id FROM inventory_reservations/.test(sql)) {
        return { rows: [{ buyer_id: BUYER_ID }] };
      }
      if (/UPDATE|DELETE/.test(sql)) changed = true;
      return { rows: [] };
    },
  };
  await assert.rejects(
    confirmPaidOrderWithClient(client, {
      orderId: ORDER_ID,
      buyerId: '20000000-0000-4000-8000-000000000099',
      occurredAt: '2030-01-01T00:00:00.000Z',
      correlationId: '40000000-0000-4000-8000-000000000001',
    }),
    /buyer does not match/,
  );
  assert.equal(changed, false);
});

function variantRow(variantId, stock) {
  return {
    variant_id: variantId,
    product_id: '50000000-0000-4000-8000-000000000001',
    size_name: 'M',
    stock,
    product_name: 'Prenda',
    unit_price_cents: 15000,
    currency: 'MXN',
    product_status: 'active',
    seller_id: '60000000-0000-4000-8000-000000000001',
    seller_user_id: '70000000-0000-4000-8000-000000000001',
    seller_name: 'Vendedor',
    seller_status: 'approved',
    seller_role: 'vendedor',
    seller_is_active: true,
  };
}
