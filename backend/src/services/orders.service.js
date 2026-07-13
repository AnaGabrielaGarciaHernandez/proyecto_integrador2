const { query } = require('../config/db');

const ORDER_COLUMNS = `
  o.id, o.order_number, o.status, o.subtotal_cents, o.total_cents, o.currency,
  o.pickup_scheduled_at, o.checkout_expires_at, o.created_at, o.updated_at,
  o.paid_at, o.cancelled_at`;
const SELLER_ORDER_COLUMNS = `
  o.id, o.order_number, o.status, o.currency, o.pickup_scheduled_at,
  o.created_at, o.updated_at, o.paid_at, o.cancelled_at`;

async function getBuyerOrders(buyerId, dbQuery = query) {
  const result = await dbQuery(
    `SELECT ${ORDER_COLUMNS},
       COALESCE(json_agg(${itemJson('oi')}
         ORDER BY oi.created_at) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.buyer_id = $1
     GROUP BY o.id
     ORDER BY o.created_at DESC`,
    [buyerId],
  );
  return result.rows.map(normalizeOrder);
}

async function getBuyerOrder(orderId, buyerId, dbQuery = query) {
  const result = await dbQuery(
    `SELECT ${ORDER_COLUMNS},
       p.status AS payment_status, p.stripe_receipt_url,
       COALESCE(json_agg(${itemJson('oi')}
         ORDER BY oi.created_at) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
     FROM orders o
     JOIN payments p ON p.order_id = o.id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.id = $1 AND o.buyer_id = $2
     GROUP BY o.id, p.status, p.stripe_receipt_url`,
    [orderId, buyerId],
  );
  if (!result.rows[0]) throw notFoundError();
  return normalizeOrder(result.rows[0]);
}

async function getSellerOrders(userId, dbQuery = query) {
  const sellerId = await findSellerId(userId, dbQuery);
  if (!sellerId) return [];
  const result = await dbQuery(
    `SELECT ${SELLER_ORDER_COLUMNS}, u.full_name AS buyer_name,
       sum(oi.total_cents)::integer AS seller_total_cents,
       COALESCE(json_agg(${itemJson('oi')} ORDER BY oi.created_at), '[]') AS items
     FROM orders o
     JOIN users u ON u.id = o.buyer_id
     JOIN order_items oi ON oi.order_id = o.id AND oi.seller_id = $1
     GROUP BY o.id, u.full_name
     ORDER BY o.created_at DESC`,
    [sellerId],
  );
  return result.rows.map(normalizeOrder);
}

async function getSellerOrder(orderId, userId, dbQuery = query) {
  const sellerId = await findSellerId(userId, dbQuery);
  if (!sellerId) throw notFoundError();
  const result = await dbQuery(
    `SELECT ${SELLER_ORDER_COLUMNS}, u.full_name AS buyer_name,
       sum(oi.total_cents)::integer AS seller_total_cents,
       COALESCE(json_agg(${itemJson('oi')} ORDER BY oi.created_at), '[]') AS items
     FROM orders o
     JOIN users u ON u.id = o.buyer_id
     JOIN order_items oi ON oi.order_id = o.id AND oi.seller_id = $2
     WHERE o.id = $1
     GROUP BY o.id, u.full_name`,
    [orderId, sellerId],
  );
  if (!result.rows[0]) throw notFoundError();
  return normalizeOrder(result.rows[0]);
}

async function findSellerId(userId, dbQuery = query) {
  const result = await dbQuery('SELECT id FROM seller_profiles WHERE user_id = $1', [userId]);
  return result.rows[0]?.id || null;
}

function itemJson(alias) {
  return `json_build_object(
    'id', ${alias}.id,
    'variant_id', ${alias}.variant_id,
    'seller_id', ${alias}.seller_id,
    'product_name', ${alias}.product_name,
    'size_name', ${alias}.size_name,
    'quantity', ${alias}.quantity,
    'unit_price_cents', ${alias}.unit_price_cents,
    'total_cents', ${alias}.total_cents,
    'created_at', ${alias}.created_at
  )`;
}

function normalizeOrder(order) {
  const integerFields = ['subtotal_cents', 'total_cents', 'seller_total_cents'];
  for (const field of integerFields) {
    if (order[field] !== undefined && order[field] !== null) order[field] = Number(order[field]);
  }
  order.items = (order.items || []).map((item) => ({
    ...item,
    quantity: Number(item.quantity),
    unit_price_cents: Number(item.unit_price_cents),
    total_cents: Number(item.total_cents),
  }));
  return order;
}

function notFoundError() {
  const error = new Error('Order not found');
  error.status = 404;
  return error;
}

module.exports = { getBuyerOrders, getBuyerOrder, getSellerOrders, getSellerOrder };
