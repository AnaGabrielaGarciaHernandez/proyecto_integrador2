const express = require('express');
const { z } = require('zod');
const { createHttpError } = require('@ecobazar/platform');
const { listProducts, getProduct } = require('../services/products');

const ListProductsSchema = z.object({
  q: z.string().trim().optional(),
  category: z.string().trim().optional(),
  min_price: z.coerce.number().int().nonnegative().optional(),
  max_price: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  offset: z.coerce.number().int().min(0).default(0),
});

function createProductsRouter(db) {
  const router = express.Router();

  router.get('/', async (req, res, next) => {
    try {
      const input = parse(ListProductsSchema, req.query, 'Invalid query parameters');
      const products = await listProducts(db, input);
      res.json({ products, pagination: { limit: input.limit, offset: input.offset } });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const id = parse(z.string().uuid(), req.params.id, 'Invalid product id');
      res.json({ product: await getProduct(db, id) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function parse(schema, value, message) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw createHttpError(message, 400, result.error.flatten?.() || result.error.issues);
  }
  return result.data;
}

module.exports = { createProductsRouter, ListProductsSchema };
