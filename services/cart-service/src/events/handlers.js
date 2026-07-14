const { EVENT_TYPES } = require('@ecobazar/contracts');
const { getOrCreateCart } = require('../services/cart');

function createCartEventHandler() {
  return async ({ event, client }) => {
    switch (event.event_type) {
      case EVENT_TYPES.USER_REGISTERED:
      case EVENT_TYPES.USER_ROLE_CHANGED:
        if (event.payload.role === 'cliente') {
          const userId = event.payload.user_id || event.payload.id;
          if (!userId) throw new Error('Identity event is missing user_id');
          await getOrCreateCart(client, userId);
        }
        break;
      case EVENT_TYPES.ORDER_PAID:
        await removePurchasedQuantities(client, event.payload);
        console.log(`[cart-service] correlation_id=${event.correlation_id} event_type=${event.event_type} step=purchased_items_removed order_id=${event.payload.order_id}`);
        break;
      default:
        break;
    }
  };
}

async function removePurchasedQuantities(client, payload) {
  if (!payload.buyer_id || !Array.isArray(payload.items)) {
    throw new Error('Order paid event is missing buyer_id or items');
  }
  const quantities = new Map();
  for (const item of payload.items) {
    if (!item.variant_id || !Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error('Order paid event contains an invalid item');
    }
    quantities.set(item.variant_id, (quantities.get(item.variant_id) || 0) + item.quantity);
  }

  for (const [variantId, quantity] of quantities) {
    await client.query(
      `DELETE FROM cart_items ci
       USING shopping_carts sc
       WHERE ci.cart_id = sc.id
         AND sc.buyer_id = $1
         AND ci.variant_id = $2
         AND ci.quantity <= $3`,
      [payload.buyer_id, variantId, quantity],
    );
    await client.query(
      `UPDATE cart_items ci
       SET quantity = ci.quantity - $3
       FROM shopping_carts sc
       WHERE ci.cart_id = sc.id
         AND sc.buyer_id = $1
         AND ci.variant_id = $2
         AND ci.quantity > $3`,
      [payload.buyer_id, variantId, quantity],
    );
  }
}

module.exports = { createCartEventHandler, removePurchasedQuantities };
