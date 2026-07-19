const express = require('express');
const { z } = require('zod');
const { createHttpError } = require('@ecobazar/platform');
const {
  getCart,
  addItem,
  updateItem,
  reconcileCart,
  deleteItem,
} = require('../services/cart');

const AddItemSchema = z.object({
  variant_id: z.string().uuid(),
  quantity: z.coerce.number().int().positive().default(1),
});
const UpdateItemSchema = z.object({
  quantity: z.coerce.number().int().positive(),
});
const UuidSchema = z.string().uuid();

function createCartRouter({ db, catalogClient }) {
  const router = express.Router();
  router.use(requireGatewayUser);

  router.get('/', async (req, res, next) => {
    try {
      res.json({ cart: await getCart(db, req.user.id) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/reconcile', async (req, res, next) => {
    try {
      res.json(await reconcileCart(db, catalogClient, req.user.id, req.correlationId));
    } catch (error) {
      next(error);
    }
  });

  router.post('/items', async (req, res, next) => {
    try {
      const input = parse(AddItemSchema, req.body, 'Invalid request body');
      const cart = await addItem(db, catalogClient, req.user.id, input, req.correlationId);
      res.status(201).json({ cart });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/items/:id', async (req, res, next) => {
    try {
      const itemId = parse(UuidSchema, req.params.id, 'Invalid cart item id');
      const input = parse(UpdateItemSchema, req.body, 'Invalid request body');
      const result = await updateItem(
        db,
        catalogClient,
        req.user.id,
        itemId,
        input.quantity,
        req.correlationId,
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.delete('/items/:id', async (req, res, next) => {
    try {
      const itemId = parse(UuidSchema, req.params.id, 'Invalid cart item id');
      res.json({ cart: await deleteItem(db, req.user.id, itemId) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function requireGatewayUser(req, res, next) {
  const parsed = UuidSchema.safeParse(req.get('x-user-id'));
  if (!parsed.success) return next(createHttpError('Authentication required', 401));
  req.user = {
    id: parsed.data,
    role: req.get('x-user-role') || 'cliente',
  };
  return next();
}

function parse(schema, value, message) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw createHttpError(message, 400, result.error.flatten?.() || result.error.issues);
  }
  return result.data;
}

module.exports = { createCartRouter };
