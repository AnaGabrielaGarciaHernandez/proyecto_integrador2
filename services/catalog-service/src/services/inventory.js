const { createHash } = require('node:crypto');
const { createHttpError } = require('@ecobazar/platform');

function normalizeItems(items) {
  const quantities = new Map();
  for (const item of items) {
    quantities.set(item.variant_id, (quantities.get(item.variant_id) || 0) + item.quantity);
  }
  return [...quantities.entries()]
    .map(([variant_id, quantity]) => ({ variant_id, quantity }))
    .sort((left, right) => left.variant_id.localeCompare(right.variant_id));
}

function reservationFingerprint({ buyer_id, items }) {
  return createHash('sha256')
    .update(JSON.stringify({ buyer_id, items: normalizeItems(items) }))
    .digest('hex');
}

async function reserveInventory(db, input, correlationId) {
  const normalized = normalizeItems(input.items);
  const fingerprint = reservationFingerprint({ buyer_id: input.buyer_id, items: normalized });

  return db.transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [input.order_id]);
    const existing = await client.query(
      'SELECT request_fingerprint FROM inventory_reservations WHERE order_id = $1 FOR UPDATE',
      [input.order_id],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].request_fingerprint !== fingerprint) {
        throw createHttpError('The order already has a different inventory reservation', 409, {
          code: 'IDEMPOTENCY_CONFLICT',
          order_id: input.order_id,
        });
      }
      return loadReservation(client, input.order_id);
    }

    const ids = normalized.map((item) => item.variant_id);
    const variants = await client.query(
      `SELECT
         pv.id AS variant_id,
         pv.product_id,
         pv.size_name,
         pv.stock::integer,
         p.name AS product_name,
         p.price_cents::integer AS unit_price_cents,
         p.currency,
         p.status AS product_status,
         p.seller_id,
         sp.user_id AS seller_user_id,
         sp.display_name AS seller_name,
         sp.status AS seller_status,
         ur.role AS seller_role,
         ur.is_active AS seller_is_active
       FROM product_variants pv
       JOIN products p ON p.id = pv.product_id
       JOIN seller_profiles sp ON sp.id = p.seller_id
       JOIN user_role_projection ur ON ur.user_id = sp.user_id
       WHERE pv.id = ANY($1::uuid[])
       ORDER BY pv.id
       FOR UPDATE OF pv`,
      [ids],
    );
    const byId = new Map(variants.rows.map((row) => [row.variant_id, row]));

    for (const requested of normalized) {
      const variant = byId.get(requested.variant_id);
      const unavailable = !variant
        || variant.product_status !== 'active'
        || variant.seller_status !== 'approved'
        || variant.seller_role !== 'vendedor'
        || variant.seller_is_active !== true;
      if (unavailable || variant.stock < requested.quantity) {
        throw stockError(requested, unavailable ? 0 : variant.stock);
      }
    }

    await client.query(
      `INSERT INTO inventory_reservations
         (order_id, buyer_id, request_fingerprint, status, expires_at)
       VALUES ($1, $2, $3, 'active', $4)`,
      [input.order_id, input.buyer_id, fingerprint, input.expires_at],
    );

    for (const requested of normalized) {
      const variant = byId.get(requested.variant_id);
      await client.query(
        'UPDATE product_variants SET stock = stock - $1 WHERE id = $2',
        [requested.quantity, requested.variant_id],
      );
      await client.query(
        `INSERT INTO inventory_reservation_items
           (order_id, variant_id, product_id, seller_id, seller_user_id, product_name,
            size_name, seller_name, quantity, unit_price_cents, currency)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [input.order_id, variant.variant_id, variant.product_id, variant.seller_id,
          variant.seller_user_id, variant.product_name, variant.size_name, variant.seller_name,
          requested.quantity, variant.unit_price_cents, variant.currency],
      );
    }

    console.log(`[catalog-service] correlation_id=${correlationId} event_type=inventory.reserved step=inventory_reserved order_id=${input.order_id}`);
    return loadReservation(client, input.order_id);
  });
}

async function releaseInventory(db, orderId, correlationId) {
  return db.transaction(async (client) => {
    const reservation = await releaseInventoryWithClient(
      client,
      orderId,
      correlationId,
      { allowMissing: true },
    );
    return reservation || {
      order_id: orderId,
      status: 'released',
      not_found: true,
      items: [],
    };
  });
}

async function releaseInventoryWithClient(client, orderId, correlationId, { allowMissing = false } = {}) {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [orderId]);
  const locked = await client.query(
    'SELECT status FROM inventory_reservations WHERE order_id = $1 FOR UPDATE',
    [orderId],
  );
  if (!locked.rows[0]) {
    if (allowMissing) return null;
    throw createHttpError('Inventory reservation not found', 404);
  }
  if (locked.rows[0].status === 'active') {
    await client.query(
      `UPDATE product_variants pv
       SET stock = pv.stock + reserved.quantity
       FROM inventory_reservation_items reserved
       WHERE reserved.order_id = $1 AND pv.id = reserved.variant_id`,
      [orderId],
    );
    await client.query(
      `UPDATE inventory_reservations
       SET status = 'released', released_at = COALESCE(released_at, now())
       WHERE order_id = $1`,
      [orderId],
    );
    console.log(`[catalog-service] correlation_id=${correlationId} event_type=order.cancelled.v1 step=inventory_released order_id=${orderId}`);
  }
  return loadReservation(client, orderId);
}

async function confirmInventory(db, orderId, correlationId) {
  return db.transaction((client) => confirmInventoryWithClient(client, orderId, correlationId));
}

async function confirmPaidOrderWithClient(
  client,
  { orderId, buyerId, occurredAt, correlationId },
) {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [orderId]);
  const owner = await client.query(
    'SELECT buyer_id FROM inventory_reservations WHERE order_id = $1 FOR UPDATE',
    [orderId],
  );
  if (!owner.rows[0]) throw createHttpError('Inventory reservation not found', 404);
  if (owner.rows[0].buyer_id !== buyerId) {
    throw new Error('Paid order buyer does not match inventory reservation buyer');
  }

  const reservation = await confirmInventoryWithClient(
    client,
    orderId,
    correlationId,
  );
  await client.query(
    `DELETE FROM wishlist_items wish
     USING (
       SELECT DISTINCT product_id
       FROM inventory_reservation_items
       WHERE order_id = $1
     ) purchased
     WHERE wish.user_id = $2
       AND wish.product_id = purchased.product_id
       AND wish.created_at <= $3::timestamptz`,
    [orderId, buyerId, occurredAt],
  );
  return reservation;
}

async function confirmInventoryWithClient(client, orderId, correlationId, { allowMissing = false } = {}) {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [orderId]);
  const locked = await client.query(
    'SELECT status FROM inventory_reservations WHERE order_id = $1 FOR UPDATE',
    [orderId],
  );
  if (!locked.rows[0]) {
    if (allowMissing) return null;
    throw createHttpError('Inventory reservation not found', 404);
  }
  if (locked.rows[0].status === 'active') {
    await client.query(
      `UPDATE inventory_reservations
       SET status = 'confirmed', confirmed_at = COALESCE(confirmed_at, now())
       WHERE order_id = $1`,
      [orderId],
    );
    console.log(`[catalog-service] correlation_id=${correlationId} event_type=order.paid.v1 step=inventory_confirmed order_id=${orderId}`);
  }
  return loadReservation(client, orderId);
}

async function loadReservation(client, orderId) {
  const result = await client.query(
    `SELECT order_id, buyer_id, status, expires_at, created_at, updated_at,
            confirmed_at, released_at
     FROM inventory_reservations
     WHERE order_id = $1`,
    [orderId],
  );
  if (!result.rows[0]) throw createHttpError('Inventory reservation not found', 404);
  const items = await client.query(
    `SELECT variant_id, product_id, seller_id, seller_user_id, product_name,
            size_name, seller_name, quantity::integer, unit_price_cents::integer, currency
     FROM inventory_reservation_items
     WHERE order_id = $1
     ORDER BY variant_id`,
    [orderId],
  );
  return { ...result.rows[0], items: items.rows };
}

function stockError(requested, available) {
  return createHttpError('There is not enough stock for one or more products', 409, {
    code: 'STOCK_UNAVAILABLE',
    variant_id: requested.variant_id,
    requested: requested.quantity,
    available,
  });
}

module.exports = {
  normalizeItems,
  reservationFingerprint,
  reserveInventory,
  releaseInventory,
  releaseInventoryWithClient,
  confirmInventory,
  confirmInventoryWithClient,
  confirmPaidOrderWithClient,
};
