const express = require('express');
const { z } = require('zod');
const { createHttpError, requireInternalToken } = require('@ecobazar/platform');

const salesQuerySchema = z.object({
  search: z.string().trim().max(120).default(''),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

const SALES_SEARCH_WHERE = `
  ($1 = ''
    OR lower(o.id::text) LIKE lower($2)
    OR lower(o.order_number) LIKE lower($2)
    OR lower(o.buyer_name) LIKE lower($2)
    OR lower(o.buyer_id::text) LIKE lower($2)
    OR EXISTS (
      SELECT 1
      FROM ordering.order_items oi_search
      WHERE oi_search.order_id = o.id
        AND (
          lower(COALESCE(oi_search.seller_name, '')) LIKE lower($2)
          OR lower(COALESCE(oi_search.seller_user_id::text, '')) LIKE lower($2)
        )
    )
  )`;

function createInternalRouter({ db, internalToken }) {
  const router = express.Router();
  router.use(requireInternalToken(internalToken));

  router.get('/reports/sales', async (req, res, next) => {
    try {
      const input = salesQuerySchema.safeParse(req.query);
      if (!input.success) {
        throw createHttpError('Invalid report query', 400, {
          query: input.error.flatten(),
        });
      }
      const { search, limit, offset } = input.data;
      const searchPattern = `%${search}%`;

      const statsResult = await db.query(
        `SELECT
           COALESCE(
             SUM(total_cents) FILTER (
               WHERE status IN ('paid', 'preparing', 'ready_for_pickup', 'delivered')
                 AND payment_status = 'succeeded'
             ),
             0
           )::bigint AS total_sales_cents,
           COUNT(*) FILTER (
             WHERE status IN ('paid', 'preparing', 'ready_for_pickup', 'delivered')
               AND payment_status = 'succeeded'
           )::integer AS paid_orders_count,
           COUNT(*) FILTER (WHERE status = 'cancelled')::integer AS cancelled_orders_count
         FROM ordering.orders`,
      );
      
      const movementsResult = await db.query(
        `SELECT o.id, o.order_number, o.buyer_id, o.buyer_name, o.status,
                o.payment_status, o.subtotal_cents, o.total_cents, o.currency,
                o.pickup_scheduled_at, o.paid_at, o.cancelled_at,
                o.created_at, o.updated_at,
                (SELECT count(*)::integer
                 FROM ordering.order_items oi_count
                 WHERE oi_count.order_id = o.id) AS item_count,
                COALESCE(
                  (SELECT jsonb_agg(
                     jsonb_build_object(
                       'id', oi.id,
                       'variant_id', oi.variant_id,
                       'product_id', oi.product_id,
                       'seller_id', oi.seller_id,
                       'seller_user_id', oi.seller_user_id,
                       'seller_name', oi.seller_name,
                       'product_name', oi.product_name,
                       'size_name', oi.size_name,
                       'image_url', oi.cover_image,
                       'quantity', oi.quantity,
                       'unit_price_cents', oi.unit_price_cents,
                       'total_cents', oi.total_cents,
                       'created_at', oi.created_at
                     ) ORDER BY oi.created_at
                   )
                   FROM ordering.order_items oi
                   WHERE oi.order_id = o.id),
                  '[]'::jsonb
                ) AS items,
                COALESCE(
                  (SELECT jsonb_agg(
                     jsonb_build_object(
                       'user_id', sellers.seller_user_id,
                       'name', sellers.seller_name
                     ) ORDER BY sellers.seller_name NULLS LAST, sellers.seller_user_id
                   )
                   FROM (
                     SELECT DISTINCT seller_user_id, seller_name
                     FROM ordering.order_items
                     WHERE order_id = o.id AND seller_user_id IS NOT NULL
                   ) AS sellers),
                  '[]'::jsonb
                ) AS sellers
         FROM ordering.orders o
         WHERE ${SALES_SEARCH_WHERE}
         ORDER BY o.created_at DESC, o.id DESC
         LIMIT $3 OFFSET $4`,
        [search, searchPattern, limit, offset],
      );
      const totalResult = await db.query(
        `SELECT count(*)::integer AS total
         FROM ordering.orders o
         WHERE ${SALES_SEARCH_WHERE}`,
        [search, searchPattern],
      );

      const stats = statsResult.rows[0] || {};
      const total = Number(totalResult.rows[0]?.total || 0);

      res.json({
        total_sales_cents: Number(stats.total_sales_cents || 0),
        paid_orders_count: Number(stats.paid_orders_count || 0),
        cancelled_orders_count: Number(stats.cancelled_orders_count || 0),
        movements: movementsResult.rows,
        total,
        pagination: {
          limit,
          offset,
          has_more: offset + movementsResult.rows.length < total,
        },
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
                    'seller_user_id', oi.seller_user_id,
                    'seller_name', oi.seller_name,
                    'product_name', oi.product_name,
                    'size_name', oi.size_name,
                    'quantity', oi.quantity,
                    'unit_price_cents', oi.unit_price_cents,
                    'total_cents', oi.total_cents,
                    'pickup_point_id', oi.pickup_point_id,
                    'pickup_point', oi.pickup_point,
                    'pickup_schedules', oi.pickup_schedules,
                    'created_at', oi.created_at
                  ) ORDER BY oi.created_at
                ) FILTER (WHERE oi.id IS NOT NULL), '[]'::json) AS items
                ,COALESCE((
                  SELECT json_agg(
                    json_build_object(
                      'id', pg.id,
                      'seller_name', pg.seller_name,
                      'point', json_build_object(
                        'name', pg.point_name,
                        'address_line', pg.address_line,
                        'city', pg.city,
                        'state', pg.state,
                        'postal_code', pg.postal_code,
                        'reference', pg.reference
                      ),
                      'scheduled_start_at', pg.scheduled_start_at,
                      'scheduled_end_at', pg.scheduled_end_at,
                      'deadline_at', pg.deadline_at,
                      'status', pg.status
                    ) ORDER BY pg.scheduled_start_at, pg.id
                  )
                  FROM ordering.pickup_groups pg
                  WHERE pg.order_id = o.id
                ), '[]'::json) AS pickup_groups
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
                    'seller_user_id', oi.seller_user_id,
                    'seller_name', oi.seller_name,
                    'product_name', oi.product_name,
                    'size_name', oi.size_name,
                    'quantity', oi.quantity,
                    'unit_price_cents', oi.unit_price_cents,
                    'total_cents', oi.total_cents,
                    'pickup_point_id', oi.pickup_point_id,
                    'pickup_point', oi.pickup_point,
                    'pickup_schedules', oi.pickup_schedules,
                    'created_at', oi.created_at
                  ) ORDER BY oi.created_at
                ), '[]'::json) AS items
                ,COALESCE((
                  SELECT json_agg(
                    json_build_object(
                      'id', pg.id,
                      'seller_name', pg.seller_name,
                      'point', json_build_object(
                        'name', pg.point_name,
                        'address_line', pg.address_line,
                        'city', pg.city,
                        'state', pg.state,
                        'postal_code', pg.postal_code,
                        'reference', pg.reference
                      ),
                      'scheduled_start_at', pg.scheduled_start_at,
                      'scheduled_end_at', pg.scheduled_end_at,
                      'deadline_at', pg.deadline_at,
                      'status', pg.status
                    ) ORDER BY pg.scheduled_start_at, pg.id
                  )
                  FROM ordering.pickup_groups pg
                  WHERE pg.order_id = o.id AND pg.seller_user_id = $1
                ), '[]'::json) AS pickup_groups
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
           SET seller_user_id = md5($1::text)::uuid,
               seller_name = 'Vendedor eliminado',
               pickup_point_id = NULL,
               pickup_point = jsonb_build_object(
                 'name', 'Punto eliminado',
                 'city', 'Ciudad eliminada',
                 'state', 'Estado eliminado'
               ),
               pickup_schedules = '[]'::jsonb
           WHERE seller_user_id = $1`,
          [userId],
        );
        await client.query(
          `UPDATE ordering.pickup_groups
           SET seller_user_id = md5($1::text)::uuid,
               seller_name = 'Vendedor eliminado',
               pickup_point_id = NULL,
               point_name = 'Punto eliminado',
               address_line = 'Dirección eliminada',
               city = 'Ciudad eliminada',
               state = 'Estado eliminado',
               postal_code = '00000',
               reference = NULL,
               updated_at = now()
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
