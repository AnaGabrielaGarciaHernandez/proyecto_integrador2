const { EVENT_TYPES } = require('@ecobazar/contracts');
const {
  confirmInventoryWithClient,
  releaseInventoryWithClient,
} = require('../services/inventory');

function createCatalogEventHandler() {
  return async ({ event, client }) => {
    const payload = event.payload;
    switch (event.event_type) {
      case EVENT_TYPES.USER_REGISTERED:
      case EVENT_TYPES.USER_ROLE_CHANGED:
        await upsertUserProjection(client, payload);
        break;
      case EVENT_TYPES.ORDER_PAID:
        await confirmInventoryWithClient(client, payload.order_id, event.correlation_id);
        break;
      case EVENT_TYPES.ORDER_CANCELLED:
        await releaseInventoryWithClient(client, payload.order_id, event.correlation_id, { allowMissing: true });
        break;
      case EVENT_TYPES.SELLER_RATING_CHANGED:
        await updateSellerRating(client, payload);
        break;
      default:
        break;
    }
  };
}

async function upsertUserProjection(client, payload) {
  const userId = payload.user_id || payload.id;
  if (!userId || !payload.role) throw new Error('Identity event is missing user_id or role');
  await client.query(
    `INSERT INTO user_role_projection (user_id, role, is_active, full_name)
     VALUES ($1, $2, COALESCE($3, true), $4)
     ON CONFLICT (user_id) DO UPDATE
     SET role = EXCLUDED.role,
         is_active = EXCLUDED.is_active,
         full_name = COALESCE(EXCLUDED.full_name, user_role_projection.full_name),
         updated_at = now()`,
    [userId, payload.role, payload.is_active, payload.full_name || null],
  );
}

async function updateSellerRating(client, payload) {
  if (!payload.seller_id || payload.rating_average === undefined) {
    throw new Error('Seller rating event is missing seller_id or rating_average');
  }
  await client.query(
    `UPDATE seller_profiles
     SET rating_average = $2,
         total_sales = COALESCE($3, total_sales)
     WHERE id = $1`,
    [payload.seller_id, payload.rating_average, payload.total_sales ?? null],
  );
}

module.exports = { createCatalogEventHandler, upsertUserProjection, updateSellerRating };
