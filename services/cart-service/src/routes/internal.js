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
