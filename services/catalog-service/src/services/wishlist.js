const { createHttpError } = require('@ecobazar/platform');
const {
  productAvailabilityFilter,
  productSelect,
  productSellerFilter,
} = require('./products');

async function listWishlist(db, userId, { limit, offset }) {
  const result = await db.query(
    `WITH visible_wishlist AS (
       SELECT visible_product.*, wi.created_at AS wishlisted_at
       FROM (
         ${productSelect({ userIdParameter: 1 })}
         WHERE p.status = 'active'
           AND ${productSellerFilter()}
           AND ${productAvailabilityFilter()}
       ) visible_product
       JOIN wishlist_items wi
         ON wi.product_id = visible_product.id
        AND wi.user_id = $1
     ),
     page AS (
       SELECT *
       FROM visible_wishlist
       ORDER BY wishlisted_at DESC, id
       LIMIT $2 OFFSET $3
     )
     SELECT
       COALESCE((SELECT json_agg(page ORDER BY wishlisted_at DESC, id) FROM page), '[]'::json) AS products,
       (SELECT count(*)::integer FROM visible_wishlist) AS total`,
    [userId, limit, offset],
  );
  return {
    products: result.rows[0]?.products || [],
    total: Number(result.rows[0]?.total || 0),
  };
}

async function addWishlistItem(db, userId, productId) {
  return db.transaction(async (client) => {
    const available = await client.query(
      `SELECT p.id
       FROM products p
       JOIN seller_profiles sp ON sp.id = p.seller_id
       JOIN user_role_projection ur ON ur.user_id = sp.user_id
       LEFT JOIN LATERAL (
         SELECT sum(pv.stock) AS total_stock
         FROM product_variants pv
         WHERE pv.product_id = p.id
       ) variants ON true
       LEFT JOIN LATERAL (
         SELECT true AS has_active_reservation
         FROM inventory_reservation_items reserved
         JOIN inventory_reservations reservation
           ON reservation.order_id = reserved.order_id
         WHERE reserved.product_id = p.id
           AND reservation.status = 'active'
         LIMIT 1
       ) active_reservation ON true
       WHERE p.id = $1
         AND p.status = 'active'
         AND ${productSellerFilter()}
         AND ${productAvailabilityFilter()}`,
      [productId],
    );
    if (!available.rows[0]) throw productUnavailable();

    const result = await client.query(
      `INSERT INTO wishlist_items (user_id, product_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, product_id) DO UPDATE
       SET user_id = EXCLUDED.user_id
       RETURNING product_id, created_at`,
      [userId, productId],
    );
    return result.rows[0];
  });
}

async function removeWishlistItem(db, userId, productId) {
  await db.query(
    'DELETE FROM wishlist_items WHERE user_id = $1 AND product_id = $2',
    [userId, productId],
  );
}

function productUnavailable() {
  return createHttpError('Este producto no está disponible.', 404, {
    code: 'PRODUCT_UNAVAILABLE',
  });
}

module.exports = {
  addWishlistItem,
  listWishlist,
  productUnavailable,
  removeWishlistItem,
};
