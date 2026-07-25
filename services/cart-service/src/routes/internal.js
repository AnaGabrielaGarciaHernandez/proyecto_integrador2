const express = require('express');
const { z } = require('zod');
const { CartSnapshotSchema } = require('@ecobazar/contracts');
const { createHttpError, requireInternalToken } = require('@ecobazar/platform');
const { getCartSnapshot } = require('../services/cart');

function createInternalRouter({ db, internalToken }) {
  const router = express.Router();
  router.use(requireInternalToken(internalToken));

  router.get('/carts/:buyerId/snapshot', async (req, res, next) => {
    try {
      const buyerId = parse(z.string().uuid(), req.params.buyerId);
      const cart = await getCartSnapshot(db, buyerId);
      const contract = CartSnapshotSchema.safeParse(cart);
      if (!contract.success) {
        throw createHttpError('Cart snapshot violates the internal contract', 500, contract.error.flatten());
      }
      res.json({ cart });
    } catch (error) {
      next(error);
    }
  });

  router.get('/privacy/users/:userId/export', async (req, res, next) => {
    try {
      const userId = parse(z.string().uuid(), req.params.userId);
      const cart = await db.query(
        `SELECT sc.id, sc.buyer_id, sc.created_at, sc.updated_at,
                COALESCE(json_agg(
                  json_build_object(
                    'id', ci.id,
                    'variant_id', ci.variant_id,
                    'product_id', ci.product_id,
                    'seller_id', ci.seller_id,
                    'product_name', ci.product_name,
                    'size_name', ci.size_name,
                    'seller_name', ci.seller_name,
                    'quantity', ci.quantity,
                    'unit_price_cents', ci.unit_price_cents,
                    'currency', ci.currency,
                    'pickup_point_id', ci.pickup_point_id,
                    'pickup_point', ci.pickup_point,
                    'pickup_schedules', ci.pickup_schedules,
                    'created_at', ci.created_at,
                    'updated_at', ci.updated_at
                  ) ORDER BY ci.created_at
                ) FILTER (WHERE ci.id IS NOT NULL), '[]'::json) AS items
         FROM shopping_carts sc
         LEFT JOIN cart_items ci ON ci.cart_id = sc.id
         WHERE sc.buyer_id = $1
         GROUP BY sc.id`,
        [userId],
      );
      res.json({ data: { cart: cart.rows[0] || null } });
    } catch (error) {
      next(error);
    }
  });

  router.post('/privacy/users/:userId/anonymize', async (req, res, next) => {
    try {
      const userId = parse(z.string().uuid(), req.params.userId);
      const result = await db.query(
        'DELETE FROM shopping_carts WHERE buyer_id = $1 RETURNING id',
        [userId],
      );
      res.json({
        service: 'cart',
        status: 'completed',
        deleted_carts: result.rowCount,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw createHttpError('Invalid request', 400, result.error.flatten?.() || result.error.issues);
  }
  return result.data;
}

module.exports = { createInternalRouter };
