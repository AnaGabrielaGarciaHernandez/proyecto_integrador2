const express = require('express');
const { z } = require('zod');

const { query, transaction } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const addItemSchema = z.object({
  variant_id: z.string().uuid(),
  quantity: z.coerce.number().int().positive().default(1),
});

const updateItemSchema = z.object({
  quantity: z.coerce.number().int().positive(),
});

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const cart = await getOrCreateCart(req.user.id);
    const items = await getCartItems(cart.id);
    res.json(formatCart(cart, items));
  } catch (error) {
    next(error);
  }
});

router.post('/items', async (req, res, next) => {
  try {
    const input = parseBody(addItemSchema, req.body);

    const result = await transaction(async (client) => {
      const cart = await getOrCreateCart(req.user.id, client);
      const variant = await getActiveVariant(input.variant_id, client);

      if (!variant) {
        const error = new Error('Variant not found');
        error.status = 404;
        throw error;
      }

      const existing = await client.query(
        'SELECT id, quantity FROM cart_items WHERE cart_id = $1 AND variant_id = $2',
        [cart.id, input.variant_id],
      );
      const nextQuantity = (existing.rows[0]?.quantity || 0) + input.quantity;

      ensureStock(nextQuantity, variant.stock);

      if (existing.rows[0]) {
        await client.query(
          `UPDATE cart_items
           SET quantity = $1, unit_price_cents = $2
           WHERE id = $3`,
          [nextQuantity, variant.price_cents, existing.rows[0].id],
        );
      } else {
        await client.query(
          `INSERT INTO cart_items (cart_id, variant_id, quantity, unit_price_cents)
           VALUES ($1, $2, $3, $4)`,
          [cart.id, input.variant_id, input.quantity, variant.price_cents],
        );
      }

      const items = await getCartItems(cart.id, client);
      return formatCart(cart, items);
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.patch('/items/:id', async (req, res, next) => {
  try {
    const itemId = z.string().uuid().parse(req.params.id);
    const input = parseBody(updateItemSchema, req.body);

    const result = await transaction(async (client) => {
      const cart = await getOrCreateCart(req.user.id, client);
      const item = await client.query(
        `SELECT ci.id, ci.variant_id, pv.stock
         FROM cart_items ci
         JOIN product_variants pv ON pv.id = ci.variant_id
         JOIN products p ON p.id = pv.product_id
         WHERE ci.id = $1 AND ci.cart_id = $2 AND p.status = 'active'`,
        [itemId, cart.id],
      );

      if (!item.rows[0]) {
        const error = new Error('Cart item not found');
        error.status = 404;
        throw error;
      }

      ensureStock(input.quantity, item.rows[0].stock);

      await client.query('UPDATE cart_items SET quantity = $1 WHERE id = $2', [input.quantity, itemId]);

      const items = await getCartItems(cart.id, client);
      return formatCart(cart, items);
    });

    res.json(result);
  } catch (error) {
    if (error.name === 'ZodError') {
      error.status = 400;
      error.message = 'Invalid cart item id';
    }
    next(error);
  }
});

router.delete('/items/:id', async (req, res, next) => {
  try {
    const itemId = z.string().uuid().parse(req.params.id);
    const cart = await getOrCreateCart(req.user.id);
    await query('DELETE FROM cart_items WHERE id = $1 AND cart_id = $2', [itemId, cart.id]);
    const items = await getCartItems(cart.id);
    res.json(formatCart(cart, items));
  } catch (error) {
    if (error.name === 'ZodError') {
      error.status = 400;
      error.message = 'Invalid cart item id';
    }
    next(error);
  }
});

async function getOrCreateCart(userId, client = { query }) {
  const existing = await client.query('SELECT id, user_id, created_at, updated_at FROM shopping_carts WHERE user_id = $1', [userId]);
  if (existing.rows[0]) return existing.rows[0];

  const inserted = await client.query(
    'INSERT INTO shopping_carts (user_id) VALUES ($1) RETURNING id, user_id, created_at, updated_at',
    [userId],
  );
  return inserted.rows[0];
}

async function getActiveVariant(variantId, client = { query }) {
  const result = await client.query(
    `SELECT pv.id, pv.stock, p.price_cents
     FROM product_variants pv
     JOIN products p ON p.id = pv.product_id
     WHERE pv.id = $1 AND p.status = 'active'`,
    [variantId],
  );
  return result.rows[0] || null;
}

async function getCartItems(cartId, client = { query }) {
  const result = await client.query(
    `SELECT
       ci.id,
       ci.variant_id,
       ci.quantity,
       ci.unit_price_cents,
       (ci.quantity * ci.unit_price_cents)::integer AS line_total_cents,
       ci.created_at,
       ci.updated_at,
       pv.size_name,
       pv.stock,
       p.id AS product_id,
       p.name AS product_name,
       p.price_cents AS current_price_cents,
       p.currency,
       json_build_object('id', sp.id, 'display_name', sp.display_name) AS seller,
       cover.cover_image
     FROM cart_items ci
     JOIN product_variants pv ON pv.id = ci.variant_id
     JOIN products p ON p.id = pv.product_id
     JOIN seller_profiles sp ON sp.id = p.seller_id
     LEFT JOIN LATERAL (
       SELECT json_build_object(
         'id', pi.id,
         'file_id', f.id,
         'url', '/' || f.bucket || '/' || f.object_key,
         'mime_type', f.mime_type
       ) AS cover_image
       FROM product_images pi
       JOIN files f ON f.id = pi.file_id
       WHERE pi.product_id = p.id
       ORDER BY pi.is_cover DESC, pi.sort_order ASC, pi.created_at ASC
       LIMIT 1
     ) cover ON true
     WHERE ci.cart_id = $1
     ORDER BY ci.created_at ASC`,
    [cartId],
  );
  return result.rows;
}

function formatCart(cart, items) {
  const subtotal = items.reduce((sum, item) => sum + Number(item.line_total_cents), 0);
  return {
    cart: {
      id: cart.id,
      user_id: cart.user_id,
      items,
      subtotal_cents: subtotal,
      total_cents: subtotal,
      currency: items[0]?.currency || 'MXN',
    },
  };
}

function ensureStock(quantity, stock) {
  if (quantity > stock) {
    const error = new Error('Requested quantity exceeds available stock');
    error.status = 409;
    error.details = { requested: quantity, available: stock };
    throw error;
  }
}

function parseBody(schema, body) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const error = new Error('Invalid request body');
    error.status = 400;
    error.details = parsed.error.flatten();
    throw error;
  }
  return parsed.data;
}

module.exports = router;
