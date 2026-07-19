const test = require('node:test');
const assert = require('node:assert/strict');

const {
  formatCart,
  ensureAvailableVariant,
  getCartSnapshot,
  addItem,
  updateItem,
  reconcileCart,
} = require('../src/services/cart');
const { removePurchasedQuantities } = require('../src/events/handlers');

const BUYER_ID = '10000000-0000-4000-8000-000000000001';
const CART_ID = '20000000-0000-4000-8000-000000000001';
const VARIANT_ID = '30000000-0000-4000-8000-000000000001';
const SECOND_VARIANT_ID = '30000000-0000-4000-8000-000000000002';
const LETTERED_VARIANT_ID = 'abcdefab-cdef-4abc-8def-abcdefabcdef';

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
    (error) => error.status === 404
      && error.message === 'Este producto ya no está disponible.'
      && error.details.code === 'PRODUCT_UNAVAILABLE'
      && !Object.hasOwn(error.details, 'variant_id'),
  );
  assert.throws(
    () => ensureAvailableVariant(variant(), 4, VARIANT_ID),
    (error) => error.status === 409
      && error.message === 'No hay suficientes unidades disponibles para completar esta acción.'
      && error.details.code === 'STOCK_UNAVAILABLE'
      && error.details.available === 3
      && !Object.hasOwn(error.details, 'requested'),
  );
  assert.doesNotThrow(() => ensureAvailableVariant(variant(), 3, VARIANT_ID));
  assert.equal(
    ensureAvailableVariant({
      ...variant(),
      stock: 0,
      buyer_reserved_quantity: 2,
    }, 2),
    2,
  );
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

test('order.paid locks variants in the same stable order used by reconciliation', async () => {
  const statements = [];
  const client = {
    async query(sql, params) {
      statements.push({ sql, params });
      return { rows: [] };
    },
  };

  await removePurchasedQuantities(client, {
    buyer_id: BUYER_ID,
    items: [
      { variant_id: SECOND_VARIANT_ID, quantity: 1 },
      { variant_id: VARIANT_ID, quantity: 1 },
    ],
  });

  assert.deepEqual(
    statements.filter(({ sql }) => /DELETE FROM cart_items/.test(sql))
      .map(({ params }) => params[1]),
    [VARIANT_ID, SECOND_VARIANT_ID],
  );
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
    variant_id: LETTERED_VARIANT_ID,
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
    { variant_id: LETTERED_VARIANT_ID.toUpperCase(), quantity: 1 },
    '50000000-0000-4000-8000-000000000001',
  );
  const upsert = statements.find(({ sql }) => /INSERT INTO cart_items/.test(sql));
  assert.match(upsert.sql, /ON CONFLICT \(cart_id, variant_id\) DO UPDATE/);
  assert.match(upsert.sql, /cart_items\.quantity \+ EXCLUDED\.quantity <= EXCLUDED\.stock_snapshot/);
  assert.equal(upsert.params[1], LETTERED_VARIANT_ID);
  assert.equal(cart.total_cents, 15000);
});

test('updateItem rejects increases above current stock with a safe conflict', async () => {
  let updateAttempted = false;
  const db = {
    transaction: (work) => work({
      async query(sql) {
        if (/INSERT INTO shopping_carts/.test(sql)) return { rows: [] };
        if (/FROM shopping_carts WHERE buyer_id/.test(sql)) {
          return { rows: [{ id: CART_ID, buyer_id: BUYER_ID }] };
        }
        if (/FOR UPDATE/.test(sql)) return { rows: [itemRow({ quantity: 2 })] };
        if (/UPDATE cart_items/.test(sql)) updateAttempted = true;
        return { rows: [] };
      },
    }),
  };
  const catalogClient = { resolveVariants: async () => [resolvedVariant({ stock: 2 })] };

  await assert.rejects(
    updateItem(db, catalogClient, BUYER_ID, itemRow().id, 3, 'correlation-id'),
    (error) => error.status === 409
      && error.details.code === 'STOCK_UNAVAILABLE'
      && error.details.available === 2,
  );
  assert.equal(updateAttempted, false);
});

test('updateItem returns a safe error when the line no longer exists', async () => {
  const db = {
    transaction: (work) => work({
      async query(sql) {
        if (/INSERT INTO shopping_carts/.test(sql)) return { rows: [] };
        if (/FROM shopping_carts WHERE buyer_id/.test(sql)) {
          return { rows: [{ id: CART_ID, buyer_id: BUYER_ID }] };
        }
        if (/FOR UPDATE/.test(sql)) return { rows: [] };
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    }),
  };

  await assert.rejects(
    updateItem(db, { resolveVariants: async () => [] }, BUYER_ID, itemRow().id, 1),
    (error) => error.status === 404
      && error.message === 'Este producto ya no está en tu carrito.'
      && error.details.code === 'CART_ITEM_NOT_FOUND',
  );
});

test('updateItem always permits decrements and uses explicit integer casts', async () => {
  let quantity = 3;
  const updates = [];
  const db = {
    transaction: (work) => work({
      async query(sql, params = []) {
        if (/INSERT INTO shopping_carts/.test(sql)) return { rows: [] };
        if (/FROM shopping_carts WHERE buyer_id/.test(sql)) {
          return { rows: [{ id: CART_ID, buyer_id: BUYER_ID }] };
        }
        if (/FOR UPDATE/.test(sql)) return { rows: [itemRow({ quantity })] };
        if (/UPDATE cart_items/.test(sql)) {
          updates.push({ sql, params });
          quantity = params[0];
          return { rows: [] };
        }
        if (/FROM cart_items/.test(sql)) {
          return {
            rows: [itemRow({
              quantity,
              stock: 2,
              line_total_cents: quantity * 15000,
            })],
          };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    }),
  };
  const catalogClient = { resolveVariants: async () => [resolvedVariant({ stock: 2 })] };

  const first = await updateItem(
    db,
    catalogClient,
    BUYER_ID,
    itemRow().id,
    2,
    'correlation-id',
  );
  const second = await updateItem(
    db,
    catalogClient,
    BUYER_ID,
    itemRow().id,
    1,
    'correlation-id',
  );

  assert.equal(first.cart.items[0].quantity, 2);
  assert.deepEqual(first.adjustments, []);
  assert.equal(second.cart.items[0].quantity, 1);
  assert.deepEqual(second.adjustments, []);
  assert.match(updates[0].sql, /quantity = \$1::integer/);
  assert.match(updates[0].sql, /stock_snapshot = \$10::integer/);
  assert.deepEqual(updates.map((update) => update.params[0]), [2, 1]);
});

test('updateItem preserves stock reserved by the same buyer', async () => {
  const fixture = updateFixture(2);
  const result = await updateItem(
    fixture.db,
    {
      resolveVariants: async () => [resolvedVariant({
        stock: 0,
        buyer_reserved_quantity: 2,
      })],
    },
    BUYER_ID,
    itemRow().id,
    1,
    'correlation-id',
  );

  assert.equal(fixture.state.deleted, false);
  assert.equal(result.cart.items[0].quantity, 1);
  assert.equal(result.cart.items[0].stock, 2);
});

test('updateItem clamps stale decrements and removes a line when stock reaches zero', async () => {
  const clamped = updateFixture(3);
  const clampedResult = await updateItem(
    clamped.db,
    { resolveVariants: async () => [resolvedVariant({ stock: 1 })] },
    BUYER_ID,
    itemRow().id,
    2,
    'correlation-id',
  );
  assert.equal(clampedResult.cart.items[0].quantity, 1);
  assert.deepEqual(clampedResult.adjustments, [{
    code: 'CART_QUANTITY_ADJUSTED',
    item_id: itemRow().id,
    product_name: itemRow().product_name,
    previous_quantity: 3,
    new_quantity: 1,
  }]);

  const removed = updateFixture(3);
  const removedResult = await updateItem(
    removed.db,
    { resolveVariants: async () => [resolvedVariant({ stock: 0 })] },
    BUYER_ID,
    itemRow().id,
    2,
    'correlation-id',
  );
  assert.equal(removedResult.cart.items.length, 0);
  assert.equal(removed.state.deleted, true);
  assert.deepEqual(removedResult.adjustments, [{
    code: 'CART_ITEM_REMOVED',
    item_id: itemRow().id,
    product_name: itemRow().product_name,
    previous_quantity: 3,
    new_quantity: 0,
  }]);
});

test('reconcileCart clamps stale quantities, removes unavailable items, and refreshes snapshots', async () => {
  const stale = itemRow({ quantity: 3 });
  const unavailable = itemRow({
    id: '90000000-0000-4000-8000-000000000002',
    variant_id: SECOND_VARIANT_ID,
    product_name: 'Producto pausado',
  });
  let remainingQuantity = stale.quantity;
  let removed = false;
  let lockedSql;
  let update;
  const db = {
    transaction: (work) => work({
      async query(sql, params = []) {
        if (/INSERT INTO shopping_carts/.test(sql)) return { rows: [] };
        if (/FROM shopping_carts WHERE buyer_id/.test(sql)) {
          return { rows: [{ id: CART_ID, buyer_id: BUYER_ID }] };
        }
        if (/FOR UPDATE/.test(sql)) {
          lockedSql = sql;
          return { rows: [stale, unavailable] };
        }
        if (/UPDATE cart_items/.test(sql)) {
          update = { sql, params };
          remainingQuantity = params[0];
          return { rows: [] };
        }
        if (/DELETE FROM cart_items/.test(sql)) {
          removed = true;
          return { rows: [] };
        }
        if (/FROM cart_items/.test(sql)) {
          return {
            rows: [itemRow({
              product_name: 'Sudadera actualizada',
              quantity: remainingQuantity,
              stock: 2,
              line_total_cents: remainingQuantity * 16000,
              unit_price_cents: 16000,
            })],
          };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    }),
  };
  let resolvedIds;
  const catalogClient = {
    async resolveVariants(ids) {
      resolvedIds = ids;
      return [resolvedVariant({
        stock: 2,
        product_name: 'Sudadera actualizada',
        unit_price_cents: 16000,
      })];
    },
  };

  const result = await reconcileCart(db, catalogClient, BUYER_ID, 'correlation-id');

  assert.match(lockedSql, /ORDER BY variant_id\s+FOR UPDATE/);
  assert.deepEqual(resolvedIds, [VARIANT_ID, SECOND_VARIANT_ID]);
  assert.equal(update.params[0], 2);
  assert.equal(update.params[4], 'Sudadera actualizada');
  assert.match(update.sql, /quantity = \$1::integer/);
  assert.equal(removed, true);
  assert.equal(result.cart.items.length, 1);
  assert.deepEqual(result.adjustments, [
    {
      code: 'CART_QUANTITY_ADJUSTED',
      item_id: stale.id,
      product_name: stale.product_name,
      previous_quantity: 3,
      new_quantity: 2,
    },
    {
      code: 'CART_ITEM_REMOVED',
      item_id: unavailable.id,
      product_name: unavailable.product_name,
      previous_quantity: 1,
      new_quantity: 0,
    },
  ]);
});

test('reconcileCart keeps inventory reserved by the same buyer', async () => {
  let deleted = false;
  let stockSnapshot = 0;
  let resolvedBuyerId;
  const db = {
    transaction: (work) => work({
      async query(sql, params = []) {
        if (/INSERT INTO shopping_carts/.test(sql)) return { rows: [] };
        if (/FROM shopping_carts WHERE buyer_id/.test(sql)) {
          return { rows: [{ id: CART_ID, buyer_id: BUYER_ID }] };
        }
        if (/FOR UPDATE/.test(sql)) {
          return { rows: [itemRow({ quantity: 2, stock: 0 })] };
        }
        if (/UPDATE cart_items/.test(sql)) {
          stockSnapshot = params[9];
          return { rows: [] };
        }
        if (/DELETE FROM cart_items/.test(sql)) {
          deleted = true;
          return { rows: [] };
        }
        if (/FROM cart_items/.test(sql)) {
          return {
            rows: [itemRow({
              quantity: 2,
              stock: stockSnapshot,
              line_total_cents: 30000,
            })],
          };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    }),
  };
  const catalogClient = {
    async resolveVariants(ids, correlationId, buyerId) {
      void ids;
      void correlationId;
      resolvedBuyerId = buyerId;
      return [resolvedVariant({
        stock: 0,
        buyer_reserved_quantity: 2,
      })];
    },
  };

  const result = await reconcileCart(db, catalogClient, BUYER_ID, 'correlation-id');

  assert.equal(resolvedBuyerId, BUYER_ID);
  assert.equal(deleted, false);
  assert.equal(stockSnapshot, 2);
  assert.equal(result.cart.items[0].quantity, 2);
  assert.equal(result.cart.items[0].stock, 2);
  assert.deepEqual(result.adjustments, []);
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

function resolvedVariant(overrides = {}) {
  return {
    ...variant(),
    variant_id: VARIANT_ID,
    product_id: '40000000-0000-4000-8000-000000000001',
    seller_id: '60000000-0000-4000-8000-000000000001',
    seller_user_id: '70000000-0000-4000-8000-000000000001',
    product_name: 'Sudadera reciclada',
    size_name: 'M',
    seller_name: 'Tienda Circular',
    unit_price_cents: 15000,
    currency: 'MXN',
    cover_image: null,
    ...overrides,
  };
}

function updateFixture(initialQuantity) {
  const state = { quantity: initialQuantity, stock: 1, deleted: false };
  return {
    state,
    db: {
      transaction: (work) => work({
        async query(sql, params = []) {
          if (/INSERT INTO shopping_carts/.test(sql)) return { rows: [] };
          if (/FROM shopping_carts WHERE buyer_id/.test(sql)) {
            return { rows: [{ id: CART_ID, buyer_id: BUYER_ID }] };
          }
          if (/FOR UPDATE/.test(sql)) {
            return { rows: [itemRow({ quantity: state.quantity })] };
          }
          if (/UPDATE cart_items/.test(sql)) {
            state.quantity = params[0];
            state.stock = params[9];
            return { rows: [] };
          }
          if (/DELETE FROM cart_items/.test(sql)) {
            state.deleted = true;
            return { rows: [] };
          }
          if (/FROM cart_items/.test(sql)) {
            if (state.deleted) return { rows: [] };
            return {
              rows: [itemRow({
                quantity: state.quantity,
                stock: state.stock,
                line_total_cents: state.quantity * 15000,
              })],
            };
          }
          throw new Error(`Unexpected SQL: ${sql}`);
        },
      }),
    },
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
