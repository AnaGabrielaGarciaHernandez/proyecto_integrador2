const express = require('express');
const { z } = require('zod');
const { InventoryReservationRequestSchema } = require('@ecobazar/contracts');
const { createHttpError, requireInternalToken } = require('@ecobazar/platform');
const { resolveVariants } = require('../services/products');
const {
  reserveInventory,
  releaseInventory,
  confirmInventory,
} = require('../services/inventory');

const ResolveVariantsSchema = z.object({
  variant_ids: z.array(z.string().uuid()).min(1).max(100),
  buyer_id: z.string().uuid().optional(),
});

function createInternalRouter({ db, internalToken }) {
  const router = express.Router();
  router.use(requireInternalToken(internalToken));

  router.post('/variants/resolve', async (req, res, next) => {
    try {
      const input = parse(ResolveVariantsSchema, req.body);
      const ids = [...new Set(input.variant_ids)].sort();
      res.json({ variants: await resolveVariants(db, ids, input.buyer_id) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/reservations', async (req, res, next) => {
    try {
      const input = parse(InventoryReservationRequestSchema, req.body);
      const reservation = await reserveInventory(db, input, req.correlationId);
      res.status(201).json({ reservation });
    } catch (error) {
      next(error);
    }
  });

  router.post('/reservations/:orderId/release', async (req, res, next) => {
    try {
      const orderId = parse(z.string().uuid(), req.params.orderId);
      res.json({ reservation: await releaseInventory(db, orderId, req.correlationId) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/reservations/:orderId/confirm', async (req, res, next) => {
    try {
      const orderId = parse(z.string().uuid(), req.params.orderId);
      res.json({ reservation: await confirmInventory(db, orderId, req.correlationId) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/seller-applications', async (req, res, next) => {
    try {
      const result = await db.query(
        `SELECT id, user_id, requested_display_name, seller_type, description, contact_phone, status, created_at
         FROM catalog.seller_applications
         WHERE status = 'pending'
         ORDER BY created_at ASC`
      );
      res.json({ applications: result.rows });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/seller-applications/:id/status', async (req, res, next) => {
    try {
      const { id } = req.params;
      const { status, rejection_reason } = req.body;
      
      const result = await db.transaction(async (client) => {
        const appRes = await client.query(
          `UPDATE catalog.seller_applications
           SET status = $1, rejection_reason = $2, reviewed_at = now()
           WHERE id = $3 AND status = 'pending'
           RETURNING *`,
          [status, rejection_reason || null, id]
        );
        if (appRes.rowCount === 0) throw createHttpError('Application not found or already processed', 404);
        
        const application = appRes.rows[0];
        
        if (status === 'approved') {
          await client.query(
            `INSERT INTO catalog.seller_profiles (user_id, seller_type, display_name, description, status, phone, verified_at)
             VALUES ($1, $2, $3, $4, 'approved', $5, now())
             ON CONFLICT (user_id) DO NOTHING`,
            [application.user_id, application.seller_type, application.requested_display_name, application.description, application.contact_phone]
          );
        }
        return application;
      });
      
      res.json(result);
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
