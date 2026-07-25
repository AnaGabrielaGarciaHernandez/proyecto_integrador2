const express = require('express');
const { z } = require('zod');
const { createHttpError, requireInternalToken } = require('@ecobazar/platform');

function createInternalRouter({ db, internalToken }) {
  const router = express.Router();
  router.use(requireInternalToken(internalToken));

  router.get('/reports/sales', async (req, res, next) => {
    try {
      // Calculamos total de ventas pagadas
      const sumResult = await db.query(
        `SELECT SUM(total_cents) as total_sales_cents FROM ordering.orders WHERE status = 'paid'`
      );
      
      // Últimos pedidos
      const recentOrdersResult = await db.query(
        `SELECT id, order_number, buyer_name, status, total_cents, created_at
         FROM ordering.orders
         ORDER BY created_at DESC
         LIMIT 10`
      );

      res.json({
        total_sales_cents: parseInt(sumResult.rows[0].total_sales_cents || '0', 10),
        recent_orders: recentOrdersResult.rows
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/privacy/users/:userId/export', async (req, res, next) => {
    try {
      const userId = parseUuid(req.params.userId);
      const buyerOrders = await db.query(
        `SELECT o.id, o.order_number, o.buyer_id, o.buyer_name, o.status,
                o.subtotal_cents, o.total_cents, o.currency, o.payment_status,
                o.stripe_receipt_url, o.pickup_scheduled_at, o.paid_at,
                o.cancelled_at, o.created_at, o.updated_at,
                COALESCE(json_agg(
                  json_build_object(
                    'id', oi.id,
                    'variant_id', oi.variant_id,
                    'product_id', oi.product_id,
                    'seller_id', oi.seller_id,
                    'product_name', oi.product_name,
                    'size_name', oi.size_name,
                    'quantity', oi.quantity,
                    'unit_price_cents', oi.unit_price_cents,
                    'total_cents', oi.total_cents,
                    'created_at', oi.created_at
                  ) ORDER BY oi.created_at
                ) FILTER (WHERE oi.id IS NOT NULL), '[]'::json) AS items
         FROM ordering.orders o
         LEFT JOIN ordering.order_items oi ON oi.order_id = o.id
         WHERE o.buyer_id = $1
         GROUP BY o.id
         ORDER BY o.created_at DESC`,
        [userId],
      );
      const sellerOrders = await db.query(
        `SELECT o.id, o.order_number, o.status, o.currency,
                o.pickup_scheduled_at, o.created_at, o.updated_at, o.paid_at,
                o.cancelled_at,
                sum(oi.total_cents)::integer AS seller_total_cents,
                COALESCE(json_agg(
                  json_build_object(
                    'id', oi.id,
                    'variant_id', oi.variant_id,
                    'product_id', oi.product_id,
                    'seller_id', oi.seller_id,
                    'product_name', oi.product_name,
                    'size_name', oi.size_name,
                    'quantity', oi.quantity,
                    'unit_price_cents', oi.unit_price_cents,
                    'total_cents', oi.total_cents,
                    'created_at', oi.created_at
                  ) ORDER BY oi.created_at
                ), '[]'::json) AS items
         FROM ordering.orders o
         JOIN ordering.order_items oi
           ON oi.order_id = o.id AND oi.seller_user_id = $1
         GROUP BY o.id
         ORDER BY o.created_at DESC`,
        [userId],
      );
      res.json({
        data: {
          buyer_orders: buyerOrders.rows,
          seller_orders: sellerOrders.rows,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/privacy/users/:userId/anonymize', async (req, res, next) => {
    try {
      const userId = parseUuid(req.params.userId);
      const result = await db.transaction(async (client) => {
        const orders = await client.query(
          `UPDATE ordering.orders
           SET buyer_id = md5($1::text)::uuid,
               buyer_name = 'Cliente eliminado',
               stripe_receipt_url = NULL,
               checkout_url = NULL,
               checkout_session_id = NULL,
               updated_at = now()
           WHERE buyer_id = $1
           RETURNING id`,
          [userId],
        );
        const items = await client.query(
          `UPDATE ordering.order_items
           SET seller_user_id = md5($1::text)::uuid
           WHERE seller_user_id = $1`,
          [userId],
        );
        await client.query(
          `UPDATE ordering.checkout_sagas
           SET last_error = NULL, updated_at = now()
           WHERE order_id = ANY($1::uuid[])`,
          [orders.rows.map((row) => row.id)],
        );
        return { buyer_orders: orders.rowCount, seller_items: items.rowCount };
      });
      res.json({ service: 'order', status: 'completed', result });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function parseUuid(value) {
  const result = z.string().uuid().safeParse(value);
  if (!result.success) throw createHttpError('Invalid privacy user id', 400);
  return result.data;
}

module.exports = { createInternalRouter };
