const { createHttpError } = require('@ecobazar/platform');

const ITEM_JSON = `jsonb_build_object(
  'id', oi.id,
  'variant_id', oi.variant_id,
  'product_id', oi.product_id,
  'seller_id', oi.seller_id,
  'seller_user_id', oi.seller_user_id,
  'product_name', oi.product_name,
  'size_name', oi.size_name,
  'image_url', oi.cover_image,
  'quantity', oi.quantity,
  'unit_price_cents', oi.unit_price_cents,
  'total_cents', oi.total_cents,
  'created_at', oi.created_at
)`;

function createOrdersRepository(db) {
  async function getPendingByBuyer(buyerId) {
    const result = await db.query(
      `SELECT id FROM orders
       WHERE buyer_id = $1 AND status = 'pending_payment'
       ORDER BY created_at DESC LIMIT 1`,
      [buyerId],
    );
    return result.rows[0] ? getSagaOrder(result.rows[0].id) : null;
  }

  async function createOrGetPending({ buyerId, buyerName, cart, correlationId }) {
    return db.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [buyerId]);
      const pending = await findPending(client, buyerId);
      if (pending) return { order: await getSagaOrder(pending.id, client), created: false };

      const snapshot = validateCart(cart, buyerId);
      const subtotal = snapshot.items.reduce(
        (sum, item) => sum + item.quantity * item.unit_price_cents,
        0,
      );
      const currency = snapshot.items[0].currency.toUpperCase();
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000 + 10_000).toISOString();
      const result = await client.query(
        `INSERT INTO orders
           (buyer_id, buyer_name, subtotal_cents, total_cents, currency, checkout_expires_at)
         VALUES ($1, $2, $3, $3, $4, $5)
         RETURNING *`,
        [buyerId, buyerName || 'Cliente', subtotal, currency, expiresAt],
      );
      const order = result.rows[0];

      for (const item of snapshot.items) {
        await client.query(
          `INSERT INTO order_items
             (order_id, variant_id, product_id, seller_id, seller_user_id,
              product_name, size_name, cover_image, quantity, unit_price_cents, total_cents)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [order.id, item.variant_id, item.product_id, item.seller_id,
            item.seller_user_id || null, item.product_name, item.size_name,
            item.image_url || null, item.quantity, item.unit_price_cents,
            item.quantity * item.unit_price_cents],
        );
      }
      await client.query(
        `INSERT INTO checkout_sagas (order_id, status, correlation_id)
         VALUES ($1, 'created', $2)`,
        [order.id, correlationId],
      );
      console.log(`[order-service] correlation_id=${correlationId} event_type=checkout.requested step=order_created order_id=${order.id}`);
      return { order: await getSagaOrder(order.id, client), created: true };
    });
  }

  async function findPending(client, buyerId) {
    const result = await client.query(
      `SELECT id FROM orders
       WHERE buyer_id = $1 AND status = 'pending_payment'
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [buyerId],
    );
    return result.rows[0] || null;
  }

  async function getSagaOrder(orderId, executor = db) {
    const result = await executor.query(
      `SELECT o.*, s.status AS saga_status, s.correlation_id, s.last_error,
         COALESCE(jsonb_agg(${ITEM_JSON} ORDER BY oi.created_at)
           FILTER (WHERE oi.id IS NOT NULL), '[]'::jsonb) AS items
       FROM orders o
       JOIN checkout_sagas s ON s.order_id = o.id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.id = $1
       GROUP BY o.id, s.order_id, s.status, s.correlation_id, s.last_error`,
      [orderId],
    );
    return result.rows[0] ? normalizeOrder(result.rows[0]) : null;
  }

  async function markInventoryReserved(orderId, correlationId, reservation) {
    return db.transaction(async (client) => {
      await client.query(
        `UPDATE checkout_sagas
         SET status = CASE WHEN status = 'created' THEN 'inventory_reserved' ELSE status END,
             updated_at = now(), last_error = NULL
         WHERE order_id = $1`,
        [orderId],
      );
      for (const item of reservation?.items || []) {
        await client.query(
          `UPDATE order_items
           SET seller_user_id = COALESCE($3, seller_user_id),
               product_id = COALESCE($4, product_id)
           WHERE order_id = $1 AND variant_id = $2`,
          [orderId, item.variant_id, item.seller_user_id || null, item.product_id || null],
        );
      }
      console.log(`[order-service] correlation_id=${correlationId} event_type=checkout.requested step=inventory_reserved order_id=${orderId}`);
      return getSagaOrder(orderId, client);
    });
  }

  async function saveCheckout(orderId, checkout, correlationId) {
    return db.transaction(async (client) => {
      await client.query(
        `UPDATE orders
         SET checkout_session_id = $2, checkout_url = $3,
             checkout_expires_at = $4, updated_at = now()
         WHERE id = $1 AND status = 'pending_payment'`,
        [orderId, checkout.session_id, checkout.url, checkout.expires_at],
      );
      await client.query(
        `UPDATE checkout_sagas
         SET status = 'payment_session_created', updated_at = now(), last_error = NULL
         WHERE order_id = $1 AND status IN ('created', 'inventory_reserved', 'payment_session_created')`,
        [orderId],
      );
      console.log(`[order-service] correlation_id=${correlationId} event_type=checkout.requested step=payment_session_created order_id=${orderId}`);
      return getSagaOrder(orderId, client);
    });
  }

  async function transitionPaid(orderId, payment, executor) {
    const locked = await executor.query(
      'SELECT id, buyer_id, status FROM orders WHERE id = $1 FOR UPDATE',
      [orderId],
    );
    const current = locked.rows[0];
    if (!current) return { order: null, transitioned: false };
    const transition = await executor.query(
      `UPDATE orders
       SET status = 'paid', payment_status = 'succeeded',
           stripe_receipt_url = COALESCE($2, stripe_receipt_url),
           paid_at = COALESCE(paid_at, now()), updated_at = now()
       WHERE id = $1 AND status = 'pending_payment'
       RETURNING id`,
      [orderId, payment.receipt_url || null],
    );
    if (transition.rows[0]) {
      await executor.query(
        `UPDATE checkout_sagas
         SET status = 'paid', last_error = NULL, updated_at = now()
         WHERE order_id = $1`,
        [orderId],
      );
    }
    return {
      order: await getSagaOrder(orderId, executor),
      transitioned: Boolean(transition.rows[0]),
    };
  }

  async function stageCompensation(orderId, reason, correlationId, executor = db) {
    await executor.query(
      `UPDATE checkout_sagas
       SET status = 'compensating', last_error = $2,
           compensation_attempts = compensation_attempts + 1,
           last_compensation_at = now(), updated_at = now()
       WHERE order_id = $1 AND status NOT IN ('paid', 'compensated')`,
      [orderId, reason],
    );
    console.log(`[order-service] correlation_id=${correlationId} event_type=order.cancelled.v1 step=compensation_started order_id=${orderId}`);
  }

  async function finishCompensation(orderId, { correlationId, causationId = null, paymentStatus = 'cancelled', reason = null }, executor = db) {
    const locked = await executor.query(
      'SELECT id, buyer_id, status FROM orders WHERE id = $1 FOR UPDATE',
      [orderId],
    );
    const order = locked.rows[0];
    if (!order) return null;
    const transition = await executor.query(
      `UPDATE orders
       SET status = 'cancelled', payment_status = $2,
           cancelled_at = COALESCE(cancelled_at, now()), updated_at = now()
       WHERE id = $1 AND status = 'pending_payment'
       RETURNING *`,
      [orderId, paymentStatus],
    );
    await executor.query(
      `UPDATE checkout_sagas
       SET status = 'compensated', last_error = $2, updated_at = now()
       WHERE order_id = $1 AND status <> 'paid'`,
      [orderId, reason],
    );
    return { order, transitioned: Boolean(transition.rows[0]), causationId, correlationId };
  }

  async function cancelBeforeReservation(orderId, { correlationId, reason }) {
    return db.transaction(async (client) => {
      await stageCompensation(orderId, reason, correlationId, client);
      return finishCompensation(orderId, { correlationId, reason, paymentStatus: 'failed' }, client);
    });
  }

  async function getOwnedOrder(orderId, buyerId) {
    const result = await db.query(
      'SELECT * FROM orders WHERE id = $1 AND buyer_id = $2',
      [orderId, buyerId],
    );
    if (!result.rows[0]) throw createHttpError('Order not found', 404);
    return normalizeOrder(result.rows[0]);
  }

  async function getBuyerOrders(buyerId) {
    const result = await db.query(
      `SELECT o.*,
         COALESCE(jsonb_agg(${ITEM_JSON} ORDER BY oi.created_at)
           FILTER (WHERE oi.id IS NOT NULL), '[]'::jsonb) AS items
       FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.buyer_id = $1
       GROUP BY o.id ORDER BY o.created_at DESC`,
      [buyerId],
    );
    return result.rows.map((row) => toPublicOrder(normalizeOrder(row)));
  }

  async function getBuyerOrder(orderId, buyerId) {
    const result = await db.query(
      `SELECT o.*,
         COALESCE(jsonb_agg(${ITEM_JSON} ORDER BY oi.created_at)
           FILTER (WHERE oi.id IS NOT NULL), '[]'::jsonb) AS items
       FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.id = $1 AND o.buyer_id = $2
       GROUP BY o.id`,
      [orderId, buyerId],
    );
    if (!result.rows[0]) throw createHttpError('Order not found', 404);
    return toPublicOrder(normalizeOrder(result.rows[0]));
  }

  async function getSellerOrders(sellerUserId) {
    const result = await db.query(
      `SELECT o.id, o.order_number, o.status, o.currency, o.buyer_name,
              o.pickup_scheduled_at, o.created_at, o.updated_at, o.paid_at, o.cancelled_at,
              sum(oi.total_cents)::integer AS seller_total_cents,
              jsonb_agg(${ITEM_JSON} ORDER BY oi.created_at) AS items
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id AND oi.seller_user_id = $1
       GROUP BY o.id ORDER BY o.created_at DESC`,
      [sellerUserId],
    );
    return result.rows.map((row) => toPublicOrder(normalizeOrder(row)));
  }

  async function getSellerOrder(orderId, sellerUserId) {
    const result = await db.query(
      `SELECT o.id, o.order_number, o.status, o.currency, o.buyer_name,
              o.pickup_scheduled_at, o.created_at, o.updated_at, o.paid_at, o.cancelled_at,
              sum(oi.total_cents)::integer AS seller_total_cents,
              jsonb_agg(${ITEM_JSON} ORDER BY oi.created_at) AS items
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id AND oi.seller_user_id = $2
       WHERE o.id = $1
       GROUP BY o.id`,
      [orderId, sellerUserId],
    );
    if (!result.rows[0]) throw createHttpError('Order not found', 404);
    return toPublicOrder(normalizeOrder(result.rows[0]));
  }

  async function listPendingCompensations(limit = 20) {
    const result = await db.query(
      `SELECT o.id, s.correlation_id, s.last_error
       FROM checkout_sagas s JOIN orders o ON o.id = s.order_id
       WHERE s.status IN ('compensating', 'compensation_pending')
         AND o.status = 'pending_payment'
       ORDER BY s.updated_at LIMIT $1`,
      [limit],
    );
    return result.rows;
  }

  async function listExpiredPendingCheckouts(limit = 20) {
    const result = await db.query(
      `SELECT o.id, o.buyer_id, o.checkout_expires_at, s.status AS saga_status,
              s.correlation_id
       FROM orders o
       JOIN checkout_sagas s ON s.order_id = o.id
       WHERE o.status = 'pending_payment'
         AND o.checkout_expires_at IS NOT NULL
         AND o.checkout_expires_at <= now()
         AND s.status IN ('created', 'inventory_reserved', 'payment_session_created')
       ORDER BY o.checkout_expires_at
       LIMIT $1`,
      [limit],
    );
    return result.rows;
  }

  async function countPendingCompensations() {
    const result = await db.query(
      `SELECT count(*)::integer AS count
       FROM checkout_sagas s
       JOIN orders o ON o.id = s.order_id
       WHERE o.status = 'pending_payment'
         AND (
           s.status IN ('compensating', 'compensation_pending')
           OR (
             o.checkout_expires_at IS NOT NULL
             AND o.checkout_expires_at <= now()
             AND s.status IN ('created', 'inventory_reserved', 'payment_session_created')
           )
         )`,
    );
    return result.rows[0].count;
  }

  return {
    getPendingByBuyer,
    createOrGetPending,
    getSagaOrder,
    markInventoryReserved,
    saveCheckout,
    transitionPaid,
    stageCompensation,
    finishCompensation,
    cancelBeforeReservation,
    getOwnedOrder,
    getBuyerOrders,
    getBuyerOrder,
    getSellerOrders,
    getSellerOrder,
    listPendingCompensations,
    listExpiredPendingCheckouts,
    countPendingCompensations,
  };
}

function validateCart(cart, buyerId) {
  if (!cart?.items?.length) throw createHttpError('The cart is empty', 409, { code: 'CART_EMPTY' });
  if (cart.buyer_id !== buyerId) throw createHttpError('Cart not found', 404);
  const currencies = new Set(cart.items.map((item) => item.currency.toUpperCase()));
  if (currencies.size !== 1) {
    throw createHttpError('All cart items must use the same currency', 409, { code: 'MIXED_CURRENCY' });
  }
  return cart;
}

function normalizeOrder(row) {
  const order = { ...row };
  for (const key of ['subtotal_cents', 'total_cents', 'seller_total_cents']) {
    if (order[key] !== undefined && order[key] !== null) order[key] = Number(order[key]);
  }
  if (order.items) {
    order.items = order.items.map((item) => ({
      ...item,
      quantity: Number(item.quantity),
      unit_price_cents: Number(item.unit_price_cents),
      total_cents: Number(item.total_cents),
    }));
  }
  return order;
}

function toPublicOrder(order) {
  const result = { ...order };
  delete result.checkout_url;
  delete result.checkout_session_id;
  return result;
}

module.exports = { createOrdersRepository, validateCart, normalizeOrder, toPublicOrder };
