const test = require('node:test');
const assert = require('node:assert/strict');

const {
  formatCart,
  ensureAvailableVariant,
  getCartSnapshot,
  addItem,
} = require('../src/services/cart');
const { removePurchasedQuantities } = require('../src/events/handlers');

const BUYER_ID = '10000000-0000-4000-8000-000000000001';
const CART_ID = '20000000-0000-4000-8000-000000000001';
const VARIANT_ID = '30000000-0000-4000-8000-000000000001';

test('formatCart preserves the public API response and calculates totals in cents', () => {
  const cart = formatCart({ id: CART_ID, buyer_id: BUYER_ID }, [itemRow({ quantity: 2, line_total_cents: 30000 })]);
  assert.equal(cart.id, CART_ID);
  assert.equal(cart.user_id, BUYER_ID);
  assert.equal(cart.items[0].seller.display_name, 'Tienda Circular');
  assert.equal(cart.subtotal_cents, 30000);
  assert.equal(cart.total_cents, 30000);
  assert.equal(cart.currency, 'MXN');
});

test('ensureAvailableVariant rejects inactive products and insufficient stock', () => {
  assert.throws(
    () => ensureAvailableVariant({ ...variant(), product_status: 'paused' }, 1, VARIANT_ID),
    (error) => error.status === 404,
  );
  assert.throws(
    () => ensureAvailableVariant(variant(), 4, VARIANT_ID),
    (error) => error.status === 409 && error.details.available === 3,
  );
  assert.doesNotThrow(() => ensureAvailableVariant(variant(), 3, VARIANT_ID));
});

test('getCartSnapshot returns only local snapshots without cross-schema joins', async () => {
  const db = {
    async query(sql) {
      if (/INSERT INTO shopping_carts/.test(sql)) return { rows: [] };
      if (/FROM shopping_carts WHERE buyer_id/.test(sql)) {
        return { rows: [{ id: CART_ID, buyer_id: BUYER_ID }] };
      }
      if (/FROM cart_items/.test(sql)) return { rows: [itemRow()] };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const snapshot = await getCartSnapshot(db, BUYER_ID);
  assert.equal(snapshot.cart_id, CART_ID);
  assert.equal(snapshot.items[0].seller_user_id, '70000000-0000-4000-8000-000000000001');
  assert.equal(snapshot.items[0].image_url, '/uploads/cover.webp');
  assert.equal(snapshot.total_cents, 15000);
});

test('order.paid removes bought quantities and aggregates duplicate variant entries', async () => {
  const statements = [];
  const client = {
    async query(sql, params) {
      statements.push({ sql, params });
      return { rows: [] };
    },
  };
  await removePurchasedQuantities(client, {
    order_id: '80000000-0000-4000-8000-000000000001',
    buyer_id: BUYER_ID,
    items: [
      { variant_id: VARIANT_ID, quantity: 1 },
      { variant_id: VARIANT_ID, quantity: 2 },
    ],
  });
  assert.equal(statements.length, 2);
  assert.deepEqual(statements[0].params, [BUYER_ID, VARIANT_ID, 3]);
  assert.match(statements[0].sql, /DELETE FROM cart_items/);
  assert.match(statements[1].sql, /UPDATE cart_items/);
});

test('addItem uses one atomic upsert to prevent concurrent cart quantities exceeding stock', async () => {
  const statements = [];
  const db = {
    transaction: (work) => work({
      async query(sql, params = []) {
        statements.push({ sql, params });
        if (/FROM shopping_carts WHERE buyer_id/.test(sql)) {
          return { rows: [{ id: CART_ID, buyer_id: BUYER_ID }] };
        }
        if (/INSERT INTO cart_items/.test(sql)) return { rows: [{ id: 'item' }] };
        if (/FROM cart_items/.test(sql)) return { rows: [itemRow()] };
        return { rows: [] };
      },
    }),
  };
  const resolved = {
    ...variant(),
    product_id: '40000000-0000-4000-8000-000000000001',
    seller_id: '60000000-0000-4000-8000-000000000001',
    seller_user_id: '70000000-0000-4000-8000-000000000001',
    product_name: 'Sudadera reciclada',
    size_name: 'M',
    seller_name: 'Tienda Circular',
    unit_price_cents: 15000,
    currency: 'MXN',
    cover_image: null,
  };
  const catalogClient = { resolveVariants: async () => [resolved] };
  const cart = await addItem(
    db,
    catalogClient,
    BUYER_ID,
    { variant_id: VARIANT_ID, quantity: 1 },
    '50000000-0000-4000-8000-000000000001',
  );
  const upsert = statements.find(({ sql }) => /INSERT INTO cart_items/.test(sql));
  assert.match(upsert.sql, /ON CONFLICT \(cart_id, variant_id\) DO UPDATE/);
  assert.match(upsert.sql, /cart_items\.quantity \+ EXCLUDED\.quantity <= EXCLUDED\.stock_snapshot/);
  assert.equal(cart.total_cents, 15000);
});

function variant() {
  return {
    variant_id: VARIANT_ID,
    product_status: 'active',
    seller_status: 'approved',
    seller_role: 'vendedor',
    seller_is_active: true,
    stock: 3,
  };
}

function itemRow(overrides = {}) {
  return {
    id: '90000000-0000-4000-8000-000000000001',
    variant_id: VARIANT_ID,
    product_id: '40000000-0000-4000-8000-000000000001',
    seller_id: '60000000-0000-4000-8000-000000000001',
    seller_user_id: '70000000-0000-4000-8000-000000000001',
    product_name: 'Sudadera reciclada',
    size_name: 'M',
    seller_name: 'Tienda Circular',
    quantity: 1,
    unit_price_cents: 15000,
    line_total_cents: 15000,
    currency: 'MXN',
    stock: 3,
    cover_image: { url: '/uploads/cover.webp' },
    ...overrides,
  };
}
