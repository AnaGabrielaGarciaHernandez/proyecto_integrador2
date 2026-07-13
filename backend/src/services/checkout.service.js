const { query, transaction } = require('../config/db');
const stripe = require('../config/stripe');
const env = require('../config/env');

const CHECKOUT_MINUTES = 30;

function businessError(message, code, status = 409, details = {}) {
  const error = new Error(message);
  error.status = status;
  error.details = { code, ...details };
  return error;
}

function requireStripe({ webhook = false } = {}) {
  if (!stripe || (webhook && !env.STRIPE_WEBHOOK_SECRET)) {
    throw businessError('Stripe is not configured', 'STRIPE_UNAVAILABLE', 503);
  }
  return stripe;
}

async function createCheckout(buyerId, dependencies = {}) {
  const stripeClient = dependencies.stripeClient || requireStripe();
  const runTransaction = dependencies.transaction || transaction;
  let createdSessionId = null;

  try {
    return await runTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [buyerId]);

    const pending = await client.query(
      `SELECT o.id, o.order_number, o.checkout_expires_at,
              p.stripe_checkout_session_id
       FROM orders o
       JOIN payments p ON p.order_id = o.id
       WHERE o.buyer_id = $1 AND o.status = 'pending_payment'
       FOR UPDATE OF o, p`,
      [buyerId],
    );

    if (pending.rows[0]) {
      const existing = pending.rows[0];
      if (existing.stripe_checkout_session_id) {
        const session = await stripeClient.checkout.sessions.retrieve(existing.stripe_checkout_session_id);
        if (session.status === 'open' && session.url) {
          return formatCheckout(existing, session);
        }
        if (session.status === 'complete') {
          throw businessError('This checkout is already being confirmed', 'CHECKOUT_IN_PROGRESS', 409, {
            order_id: existing.id,
          });
        }
      }
      await cancelPendingOrder(client, existing.id, { rawEvent: null });
    }

    const cartResult = await client.query(
      `SELECT sc.id AS cart_id, ci.variant_id, ci.quantity, ci.unit_price_cents,
              pv.stock, pv.size_name, p.name AS product_name, p.currency,
              p.status AS product_status, p.seller_id
       FROM shopping_carts sc
       JOIN cart_items ci ON ci.cart_id = sc.id
       JOIN product_variants pv ON pv.id = ci.variant_id
       JOIN products p ON p.id = pv.product_id
       WHERE sc.user_id = $1
       ORDER BY ci.variant_id
       FOR UPDATE OF sc, ci, pv, p`,
      [buyerId],
    );
    const items = cartResult.rows;

    if (!items.length) {
      throw businessError('The cart is empty', 'CART_EMPTY', 409);
    }

    const inactive = items.find((item) => item.product_status !== 'active');
    if (inactive) {
      throw businessError('A product is no longer available', 'STOCK_UNAVAILABLE', 409, {
        variant_id: inactive.variant_id,
        available: 0,
      });
    }

    const currencies = new Set(items.map((item) => item.currency.toUpperCase()));
    if (currencies.size !== 1) {
      throw businessError('All cart items must use the same currency', 'MIXED_CURRENCY', 409);
    }

    const unavailable = items.find((item) => Number(item.stock) < Number(item.quantity));
    if (unavailable) {
      throw businessError('There is not enough stock for one or more products', 'STOCK_UNAVAILABLE', 409, {
        variant_id: unavailable.variant_id,
        requested: Number(unavailable.quantity),
        available: Number(unavailable.stock),
      });
    }

    const subtotal = items.reduce(
      (sum, item) => sum + Number(item.quantity) * Number(item.unit_price_cents),
      0,
    );
    const currency = [...currencies][0];
    // A small clock-skew allowance keeps the value above Stripe's 30-minute minimum.
    const provisionalExpiry = new Date(Date.now() + CHECKOUT_MINUTES * 60 * 1000 + 10_000);

    const orderResult = await client.query(
      `INSERT INTO orders
         (order_number, buyer_id, status, subtotal_cents, total_cents, currency, checkout_expires_at)
       VALUES (NULL, $1, 'pending_payment', $2, $2, $3, $4)
       RETURNING id, order_number, checkout_expires_at`,
      [buyerId, subtotal, currency, provisionalExpiry],
    );
    const order = orderResult.rows[0];

    for (const item of items) {
      await client.query(
        `INSERT INTO order_items
           (order_id, variant_id, seller_id, product_name, size_name, quantity,
            unit_price_cents, total_cents)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          order.id,
          item.variant_id,
          item.seller_id,
          item.product_name,
          item.size_name,
          item.quantity,
          item.unit_price_cents,
          Number(item.quantity) * Number(item.unit_price_cents),
        ],
      );
      await client.query(
        'UPDATE product_variants SET stock = stock - $1 WHERE id = $2',
        [item.quantity, item.variant_id],
      );
    }

    await client.query(
      `INSERT INTO payments (order_id, status, amount_cents, currency)
       VALUES ($1, 'pending', $2, $3)`,
      [order.id, subtotal, currency],
    );

    const origin = env.CLIENT_ORIGIN.split(',')[0].trim().replace(/\/$/, '');
    const session = await stripeClient.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: items.map((item) => ({
        quantity: Number(item.quantity),
        price_data: {
          currency: currency.toLowerCase(),
          unit_amount: Number(item.unit_price_cents),
          product_data: { name: `${item.product_name} · ${item.size_name}` },
        },
      })),
      metadata: { order_id: order.id, buyer_id: buyerId },
      payment_intent_data: { metadata: { order_id: order.id, buyer_id: buyerId } },
      success_url: `${origin}/checkout/exito?order_id=${order.id}`,
      cancel_url: `${origin}/checkout/cancelado?order_id=${order.id}`,
      expires_at: Math.floor(provisionalExpiry.getTime() / 1000),
    }, { idempotencyKey: `checkout-${order.id}` });
    createdSessionId = session.id;

    await client.query(
      `UPDATE orders SET checkout_expires_at = to_timestamp($1) WHERE id = $2`,
      [session.expires_at, order.id],
    );
    await client.query(
      `UPDATE payments SET stripe_checkout_session_id = $1 WHERE order_id = $2`,
      [session.id, order.id],
    );

    return formatCheckout(order, session);
    });
  } catch (error) {
    if (createdSessionId) {
      await stripeClient.checkout.sessions.expire(createdSessionId).catch(() => {});
    }
    if (isStripeError(error)) {
      throw businessError('Stripe is temporarily unavailable', 'STRIPE_UNAVAILABLE', 503);
    }
    throw error;
  }
}

function formatCheckout(order, session) {
  return {
    order_id: order.id,
    order_number: order.order_number,
    session_id: session.id,
    url: session.url,
    expires_at: new Date(session.expires_at * 1000).toISOString(),
  };
}

async function cancelCheckout(orderId, buyerId) {
  const stripeClient = requireStripe();
  const found = await query(
    `SELECT o.id, o.status, p.stripe_checkout_session_id
     FROM orders o JOIN payments p ON p.order_id = o.id
     WHERE o.id = $1 AND o.buyer_id = $2`,
    [orderId, buyerId],
  );
  if (!found.rows[0]) throw notFoundError();

  const current = found.rows[0];
  if (current.status === 'pending_payment' && current.stripe_checkout_session_id) {
    const session = await stripeClient.checkout.sessions.retrieve(current.stripe_checkout_session_id);
    if (session.status === 'open') {
      await stripeClient.checkout.sessions.expire(current.stripe_checkout_session_id);
    } else if (session.status === 'complete') {
      const order = await query('SELECT * FROM orders WHERE id = $1 AND buyer_id = $2', [orderId, buyerId]);
      return order.rows[0];
    }
  }

  return transaction(async (client) => {
    const owned = await client.query(
      'SELECT id FROM orders WHERE id = $1 AND buyer_id = $2 FOR UPDATE',
      [orderId, buyerId],
    );
    if (!owned.rows[0]) throw notFoundError();
    await cancelPendingOrder(client, orderId, { rawEvent: null });
    const result = await client.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    return result.rows[0];
  });
}

async function cancelPendingOrder(client, orderId, { rawEvent }) {
  const transition = await client.query(
    `UPDATE orders
     SET status = 'cancelled', cancelled_at = COALESCE(cancelled_at, now())
     WHERE id = $1 AND status = 'pending_payment'
     RETURNING id`,
    [orderId],
  );
  if (!transition.rows[0]) return false;

  await client.query(
    `UPDATE product_variants pv
     SET stock = pv.stock + restored.quantity
     FROM (
       SELECT variant_id, sum(quantity)::integer AS quantity
       FROM order_items
       WHERE order_id = $1 AND variant_id IS NOT NULL
       GROUP BY variant_id
     ) restored
     WHERE pv.id = restored.variant_id`,
    [orderId],
  );
  await client.query(
    `UPDATE payments
     SET status = 'cancelled', raw_event = COALESCE($2::jsonb, raw_event)
     WHERE order_id = $1`,
    [orderId, rawEvent ? JSON.stringify(rawEvent) : null],
  );
  return true;
}

async function processStripeEvent(event, dependencies = {}) {
  const stripeClient = dependencies.stripeClient || requireStripe({ webhook: true });
  const runTransaction = dependencies.transaction || transaction;
  if (!['checkout.session.completed', 'checkout.session.expired'].includes(event.type)) return;

  const session = event.data.object;
  const orderId = session.metadata?.order_id;
  if (!orderId) return;

  let paymentDetails = {};
  if (event.type === 'checkout.session.completed' && session.payment_status === 'paid' && session.payment_intent) {
    const intentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent.id;
    const intent = await stripeClient.paymentIntents.retrieve(intentId, { expand: ['latest_charge'] });
    const charge = typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
    paymentDetails = {
      intentId: intent.id,
      chargeId: charge?.id || (typeof intent.latest_charge === 'string' ? intent.latest_charge : null),
      receiptUrl: charge?.receipt_url || null,
    };
  }

  await runTransaction(async (client) => {
    const locked = await client.query(
      'SELECT id, buyer_id, status FROM orders WHERE id = $1 FOR UPDATE',
      [orderId],
    );
    const order = locked.rows[0];
    if (!order || (session.metadata?.buyer_id && session.metadata.buyer_id !== order.buyer_id)) return;

    if (event.type === 'checkout.session.expired') {
      await cancelPendingOrder(client, orderId, { rawEvent: event });
      return;
    }

    if (session.payment_status !== 'paid') return;
    if (!['pending_payment', 'paid'].includes(order.status)) return;
    if (order.status === 'pending_payment') {
      await client.query(
        `UPDATE orders SET status = 'paid', paid_at = COALESCE(paid_at, now()) WHERE id = $1`,
        [orderId],
      );
      await removePurchasedCartQuantities(client, orderId, order.buyer_id);
    }
    await client.query(
      `UPDATE payments
       SET status = 'succeeded', stripe_checkout_session_id = COALESCE($2, stripe_checkout_session_id),
           stripe_payment_intent_id = COALESCE($3, stripe_payment_intent_id),
           stripe_charge_id = COALESCE($4, stripe_charge_id),
           stripe_receipt_url = COALESCE($5, stripe_receipt_url), raw_event = $6::jsonb
       WHERE order_id = $1`,
      [orderId, session.id, paymentDetails.intentId, paymentDetails.chargeId,
        paymentDetails.receiptUrl, JSON.stringify(event)],
    );
  });
}

async function removePurchasedCartQuantities(client, orderId, buyerId) {
  await client.query(
    `WITH purchased AS (
       SELECT variant_id, sum(quantity)::integer AS quantity
       FROM order_items WHERE order_id = $1 AND variant_id IS NOT NULL GROUP BY variant_id
     )
     DELETE FROM cart_items ci
     USING purchased, shopping_carts sc
     WHERE ci.cart_id = sc.id AND sc.user_id = $2 AND ci.variant_id = purchased.variant_id
       AND ci.quantity <= purchased.quantity`,
    [orderId, buyerId],
  );
  await client.query(
    `WITH purchased AS (
       SELECT variant_id, sum(quantity)::integer AS quantity
       FROM order_items WHERE order_id = $1 AND variant_id IS NOT NULL GROUP BY variant_id
     )
     UPDATE cart_items ci
     SET quantity = ci.quantity - purchased.quantity
     FROM purchased, shopping_carts sc
     WHERE ci.cart_id = sc.id AND sc.user_id = $2 AND ci.variant_id = purchased.variant_id
       AND ci.quantity > purchased.quantity`,
    [orderId, buyerId],
  );
}

function constructWebhookEvent(rawBody, signature, dependencies = {}) {
  const stripeClient = dependencies.stripeClient || requireStripe({ webhook: true });
  const webhookSecret = dependencies.webhookSecret || env.STRIPE_WEBHOOK_SECRET;
  if (!signature) throw businessError('Missing Stripe signature', 'INVALID_SIGNATURE', 400);
  try {
    return stripeClient.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (cause) {
    const error = businessError('Invalid Stripe signature', 'INVALID_SIGNATURE', 400);
    error.cause = cause;
    throw error;
  }
}

function notFoundError() {
  const error = new Error('Order not found');
  error.status = 404;
  return error;
}

function isStripeError(error) {
  return Boolean(error?.type?.startsWith('Stripe') || ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'].includes(error?.code));
}

module.exports = {
  CHECKOUT_MINUTES,
  createCheckout,
  cancelCheckout,
  constructWebhookEvent,
  processStripeEvent,
  cancelPendingOrder,
  businessError,
};
