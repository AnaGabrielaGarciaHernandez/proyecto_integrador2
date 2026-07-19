const {
  EVENT_TYPES,
  PaymentCheckoutRequestSchema,
} = require('@ecobazar/contracts');
const {
  createEvent,
  createHttpError,
  insertOutbox,
} = require('@ecobazar/platform');

function createCheckoutService({ db, orders, cartClient, catalogClient, paymentClient }) {
  async function createCheckout(identity, correlationId) {
    let order = await orders.getPendingByBuyer(identity.id);
    let cart = null;
    if (order?.saga_status === 'compensation_pending') {
      await compensate(order.id, {
        correlationId: order.correlation_id || correlationId,
        reason: order.last_error || 'Pending checkout compensation',
      }).catch(() => {});
      throw createHttpError('A previous checkout is being cancelled', 409, {
        code: 'CHECKOUT_IN_PROGRESS', order_id: order.id,
      });
    }
    if (isReusableCheckout(order)) {
      cart = await loadCartSnapshot(identity.id, correlationId);
      if (checkoutMatchesCart(order, cart)) return formatCheckout(order);
      await retireCheckoutForReplacement(order, correlationId);
      order = null;
      cart = await loadCartSnapshot(identity.id, correlationId);
    }
    if (!order) {
      cart ||= await loadCartSnapshot(identity.id, correlationId);
      const result = await orders.createOrGetPending({
        buyerId: identity.id,
        buyerName: identity.name,
        cart,
        correlationId,
      });
      order = result.order;
      if (isReusableCheckout(order)) {
        if (checkoutMatchesCart(order, cart)) return formatCheckout(order);
        throw createHttpError('Checkout is being refreshed', 409, {
          code: 'CHECKOUT_IN_PROGRESS', order_id: order.id,
        });
      }
    }
    // The saga correlation id is stable across HTTP retries. It is also embedded
    // in Stripe metadata, so keeping it stable preserves Stripe idempotency.
    const flowCorrelationId = order.correlation_id || correlationId;

    if (order.saga_status === 'created') {
      try {
        const reservation = await catalogClient.reserve({
          order_id: order.id,
          buyer_id: order.buyer_id,
          expires_at: toIso(order.checkout_expires_at),
          items: order.items.map(({ variant_id, quantity }) => ({ variant_id, quantity })),
        }, flowCorrelationId);
        order = await orders.markInventoryReserved(order.id, flowCorrelationId, reservation);
      } catch (error) {
        await compensate(order.id, {
          correlationId: flowCorrelationId,
          reason: `Inventory reservation failed: ${error.message}`,
          paymentStatus: 'failed',
        }).catch(() => {});
        throw error;
      }
    }

    if (!['inventory_reserved', 'payment_session_created'].includes(order.saga_status)) {
      throw createHttpError('Checkout cannot continue in its current state', 409, {
        code: 'CHECKOUT_IN_PROGRESS', order_id: order.id,
      });
    }

    try {
      const request = PaymentCheckoutRequestSchema.parse({
        order_id: order.id,
        order_number: order.order_number,
        buyer_id: order.buyer_id,
        amount_cents: order.total_cents,
        currency: order.currency,
        expires_at: toIso(order.checkout_expires_at),
        items: order.items.map((item) => ({
          product_name: item.product_name,
          size_name: item.size_name,
          quantity: item.quantity,
          unit_price_cents: item.unit_price_cents,
        })),
      });
      const response = await paymentClient.createCheckout(request, flowCorrelationId);
      if (response.checkout?.status === 'complete') {
        throw createHttpError('This checkout is already being confirmed', 409, {
          code: 'CHECKOUT_IN_PROGRESS', order_id: order.id,
        });
      }
      if (response.checkout?.status !== 'open' || response.payment?.status === 'failed') {
        await compensate(order.id, {
          correlationId: flowCorrelationId,
          reason: 'Stripe checkout is no longer available',
          paymentStatus: response.payment?.status === 'failed' ? 'failed' : 'cancelled',
        });
        throw createHttpError('Checkout session is no longer available', 409, {
          code: 'CHECKOUT_IN_PROGRESS', order_id: order.id,
        });
      }
      order = await orders.saveCheckout(order.id, response.checkout, flowCorrelationId);
      const latestCart = await loadCartSnapshot(identity.id, correlationId);
      if (!checkoutMatchesCart(order, latestCart)) {
        await retireCheckoutForReplacement(order, correlationId);
        throw createHttpError('Cart changed during checkout creation', 409, {
          code: 'CHECKOUT_CART_CHANGED',
        });
      }
      return formatCheckout(order);
    } catch (error) {
      if (['CHECKOUT_IN_PROGRESS', 'CHECKOUT_CART_CHANGED'].includes(error.details?.code)) {
        throw error;
      }
      if (error.details?.code === 'STRIPE_UNAVAILABLE') {
        // Payment only returns this business error after persisting a failed
        // creation. There is no usable Checkout Session, so stock can be
        // released immediately.
        await compensate(order.id, {
          correlationId: flowCorrelationId,
          reason: `Stripe checkout failed: ${error.message}`,
          paymentStatus: 'failed',
        }).catch(() => {});
        throw error;
      }

      // A transport timeout or a local Order write failure is ambiguous: Payment
      // may already have created a live Stripe Session. Releasing stock here
      // would allow that session to charge an unreserved order. Keep the pending
      // order so an HTTP retry can recover the idempotent session; Stripe expiry
      // remains the final compensation path.
      console.error(`[order-service] correlation_id=${flowCorrelationId} event_type=checkout.requested step=checkout_state_uncertain order_id=${order.id}`, error);
      throw createHttpError('Checkout state is still being confirmed', 503, {
        code: 'CHECKOUT_IN_PROGRESS', order_id: order.id,
      });
    }
  }

  async function cancelCheckout(orderId, buyerId, correlationId) {
    const order = await orders.getOwnedOrder(orderId, buyerId);
    if (order.status !== 'pending_payment') return orders.getBuyerOrder(orderId, buyerId);

    const response = await expireCheckoutSession(orderId, correlationId);
    if (response.payment?.status === 'succeeded' || response.checkout?.status === 'complete') {
      return orders.getBuyerOrder(orderId, buyerId);
    }
    if (!isConfirmedWithoutCharge(response)) {
      throw createHttpError('Checkout state is still being confirmed', 409, {
        code: 'CHECKOUT_IN_PROGRESS',
      });
    }
    await compensate(orderId, {
      correlationId,
      reason: 'Checkout cancelled by buyer',
      paymentStatus: 'cancelled',
    });
    return orders.getBuyerOrder(orderId, buyerId);
  }

  async function cancelActiveCheckout(buyerId, correlationId) {
    const order = await orders.getPendingByBuyer(buyerId);
    if (!order) return null;
    if (order.saga_status !== 'payment_session_created' || !order.checkout_session_id) {
      throw createHttpError('Checkout state is still being confirmed', 409, {
        code: 'CHECKOUT_IN_PROGRESS',
      });
    }
    return cancelCheckout(order.id, buyerId, correlationId);
  }

  async function loadCartSnapshot(buyerId, correlationId) {
    const cart = await cartClient.getSnapshot(buyerId, correlationId);
    if (cart?.buyer_id !== buyerId) {
      throw createHttpError('Cart snapshot violates the internal contract', 502, {
        code: 'DEPENDENCY_INVALID_RESPONSE', dependency: 'cart-service',
      });
    }
    return cart;
  }

  async function retireCheckoutForReplacement(order, correlationId) {
    const response = await expireCheckoutSession(order.id, correlationId);
    if (response.payment?.status === 'succeeded' || response.checkout?.status === 'complete') {
      throw createHttpError('This checkout is already being confirmed', 409, {
        code: 'CHECKOUT_IN_PROGRESS', order_id: order.id,
      });
    }
    if (!isConfirmedWithoutCharge(response)) {
      throw createHttpError('Checkout state is still being confirmed', 503, {
        code: 'CHECKOUT_IN_PROGRESS', order_id: order.id,
      });
    }
    await compensate(order.id, {
      correlationId,
      reason: 'Cart changed after checkout creation',
      paymentStatus: response.payment?.status === 'failed' ? 'failed' : 'cancelled',
    });
  }

  async function expireCheckoutSession(orderId, correlationId) {
    try {
      return await paymentClient.expire(orderId, correlationId);
    } catch (error) {
      if (error.status === 404) {
        throw createHttpError('Checkout state is still being confirmed', 409, {
          code: 'CHECKOUT_IN_PROGRESS',
        });
      }
      throw error;
    }
  }

  async function compensate(orderId, {
    correlationId,
    causationId = null,
    reason,
    paymentStatus = 'cancelled',
  }) {
    const current = await orders.getSagaOrder(orderId);
    if (!current || current.status === 'paid' || current.saga_status === 'paid') return current;
    if (current.saga_status === 'compensated' || current.status === 'cancelled') return current;

    await db.transaction((client) => orders.stageCompensation(orderId, reason, correlationId, client));
    try {
      const reservation = await catalogClient.release(orderId, correlationId);
      if (reservation && !['released', 'expired', 'cancelled'].includes(reservation.status)) {
        throw new Error(`Inventory reservation is ${reservation.status}`);
      }
    } catch (error) {
      await db.query(
        `UPDATE checkout_sagas SET status = 'compensation_pending', last_error = $2,
         updated_at = now() WHERE order_id = $1 AND status <> 'paid'`,
        [orderId, `${reason}: ${error.message}`],
      );
      console.error(`[order-service] correlation_id=${correlationId} event_type=${EVENT_TYPES.ORDER_CANCELLED} step=inventory_release_failed order_id=${orderId}`, error);
      throw error;
    }

    await db.transaction(async (client) => {
      const result = await orders.finishCompensation(orderId, {
        correlationId, causationId, paymentStatus, reason,
      }, client);
      if (result?.transitioned) {
        const cancelled = await orders.getSagaOrder(orderId, client);
        await emitCancelled(client, cancelled, correlationId, causationId, reason);
      }
    });
    console.log(`[order-service] correlation_id=${correlationId} event_type=${EVENT_TYPES.ORDER_CANCELLED} step=inventory_released order_id=${orderId}`);
    return orders.getSagaOrder(orderId);
  }

  async function emitCancelled(client, order, correlationId, causationId, reason) {
    const event = createEvent({
      eventType: EVENT_TYPES.ORDER_CANCELLED,
      producer: 'order-service',
      correlationId,
      causationId,
      payload: {
        order_id: order.id,
        buyer_id: order.buyer_id,
        reason,
        items: order.items.map(({ variant_id, quantity }) => ({ variant_id, quantity })),
      },
    });
    await insertOutbox(client, event);
    console.log(`[order-service] correlation_id=${correlationId} event_type=${event.event_type} step=outbox_created order_id=${order.id}`);
  }

  return {
    createCheckout,
    cancelCheckout,
    cancelActiveCheckout,
    compensate,
    emitCancelled,
  };
}

function isReusableCheckout(order) {
  if (!order?.checkout_url || !order.checkout_session_id) return false;
  return order.status === 'pending_payment'
    && order.saga_status === 'payment_session_created'
    && new Date(order.checkout_expires_at).getTime() > Date.now();
}

function formatCheckout(order) {
  return {
    order_id: order.id,
    order_number: order.order_number,
    session_id: order.checkout_session_id,
    url: order.checkout_url,
    expires_at: toIso(order.checkout_expires_at),
  };
}

function checkoutMatchesCart(order, cart) {
  if (!cart || cart.buyer_id !== order.buyer_id) return false;
  if (String(order.currency).toUpperCase() !== cartCurrency(cart)) return false;
  const cartTotal = cart.items.reduce(
    (total, item) => total + Number(item.quantity) * Number(item.unit_price_cents),
    0,
  );
  if (Number(order.total_cents) !== cartTotal) return false;
  return JSON.stringify(canonicalItems(order.items)) === JSON.stringify(canonicalItems(cart.items));
}

function canonicalItems(items = []) {
  return items.map((item) => ({
    variant_id: item.variant_id,
    product_id: item.product_id,
    seller_id: item.seller_id,
    seller_user_id: item.seller_user_id || null,
    product_name: item.product_name,
    size_name: item.size_name,
    quantity: Number(item.quantity),
    unit_price_cents: Number(item.unit_price_cents),
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function cartCurrency(cart) {
  const currencies = new Set(
    (cart.items || []).map((item) => String(item.currency).toUpperCase()),
  );
  return currencies.size === 1 ? [...currencies][0] : null;
}

function isConfirmedWithoutCharge(response) {
  return ['cancelled', 'failed'].includes(response.payment?.status)
    || ['expired', 'cancelled'].includes(response.checkout?.status);
}

function toIso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

module.exports = { createCheckoutService, formatCheckout };
