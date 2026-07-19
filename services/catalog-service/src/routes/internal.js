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
