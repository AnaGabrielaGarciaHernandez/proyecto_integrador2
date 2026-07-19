const express = require('express');
const { requireInternalToken } = require('@ecobazar/platform');

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

  return router;
}

module.exports = { createInternalRouter };
