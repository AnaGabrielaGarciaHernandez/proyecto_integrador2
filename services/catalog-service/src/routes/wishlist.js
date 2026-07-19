const express = require('express');
const { z } = require('zod');
const { createHttpError } = require('@ecobazar/platform');
const {
  addWishlistItem,
  listWishlist,
  productUnavailable,
  removeWishlistItem,
} = require('../services/wishlist');

const PaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(24),
  offset: z.coerce.number().int().min(0).default(0),
});
const UuidSchema = z.string().uuid();

function createWishlistRouter(db) {
  const router = express.Router();
  router.use(requireWishlistUser);

  router.get('/', async (req, res, next) => {
    try {
      const pagination = parse(PaginationSchema, req.query, 'Paginación inválida.');
      const result = await listWishlist(db, req.user.id, pagination);
      res.json({
        products: result.products,
        total: result.total,
        pagination,
      });
    } catch (error) {
      next(error);
    }
  });

  router.put('/:productId', async (req, res, next) => {
    try {
      const productId = parseProductId(req.params.productId);
      res.json(await addWishlistItem(db, req.user.id, productId));
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:productId', async (req, res, next) => {
    try {
      const productId = parseProductId(req.params.productId);
      await removeWishlistItem(db, req.user.id, productId);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function requireWishlistUser(req, res, next) {
  const id = UuidSchema.safeParse(req.get('x-user-id'));
  if (!id.success) {
    return next(createHttpError('Debes iniciar sesión.', 401, {
      code: 'AUTHENTICATION_REQUIRED',
    }));
  }
  const role = req.get('x-user-role');
  if (!['cliente', 'vendedor'].includes(role)) {
    return next(createHttpError('No tienes permiso para usar una lista de deseos.', 403, {
      code: 'FORBIDDEN',
    }));
  }
  req.user = { id: id.data, role };
  return next();
}

function parseProductId(value) {
  const result = UuidSchema.safeParse(value);
  if (!result.success) throw productUnavailable();
  return result.data;
}

function parse(schema, value, message) {
  const result = schema.safeParse(value);
  if (!result.success) throw createHttpError(message, 400);
  return result.data;
}

module.exports = { createWishlistRouter, requireWishlistUser };
