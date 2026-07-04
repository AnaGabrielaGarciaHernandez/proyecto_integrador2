const express = require('express');
const { z } = require('zod');

const { query } = require('../config/db');

const router = express.Router();

const listSchema = z.object({
  q: z.string().trim().optional(),
  category: z.string().trim().optional(),
  min_price: z.coerce.number().int().nonnegative().optional(),
  max_price: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  offset: z.coerce.number().int().min(0).default(0),
});

router.get('/', async (req, res, next) => {
  try {
    const input = parseQuery(listSchema, req.query);
    const params = [];
    const where = ['p.status = $1'];
    params.push('active');

    if (input.q) {
      params.push(`%${input.q}%`);
      where.push(`(p.name ILIKE $${params.length} OR p.description ILIKE $${params.length})`);
    }

    if (input.category) {
      params.push(input.category);
      where.push(`c.slug = $${params.length}`);
    }

    if (input.min_price !== undefined) {
      params.push(input.min_price);
      where.push(`p.price_cents >= $${params.length}`);
    }

    if (input.max_price !== undefined) {
      params.push(input.max_price);
      where.push(`p.price_cents <= $${params.length}`);
    }

    params.push(input.limit, input.offset);

    const result = await query(
      `SELECT
         p.id,
         p.name,
         p.description,
         p.condition,
         p.price_cents,
         p.currency,
         p.status,
         p.created_at,
         json_build_object('id', c.id, 'name', c.name, 'slug', c.slug) AS category,
         json_build_object('id', sp.id, 'display_name', sp.display_name, 'rating_average', sp.rating_average) AS seller,
         CASE WHEN b.id IS NULL THEN NULL ELSE json_build_object('id', b.id, 'name', b.name) END AS bazaar,
         COALESCE(v.variants, '[]'::json) AS variants,
         COALESCE(i.images, '[]'::json) AS images,
         COALESCE(v.total_stock, 0)::integer AS total_stock
       FROM products p
       JOIN categories c ON c.id = p.category_id
       JOIN seller_profiles sp ON sp.id = p.seller_id
       LEFT JOIN bazaars b ON b.id = p.bazaar_id
       LEFT JOIN LATERAL (
         SELECT
           json_agg(json_build_object('id', pv.id, 'size_name', pv.size_name, 'stock', pv.stock) ORDER BY pv.size_name) AS variants,
           SUM(pv.stock) AS total_stock
         FROM product_variants pv
         WHERE pv.product_id = p.id
       ) v ON true
       LEFT JOIN LATERAL (
         SELECT json_agg(
           json_build_object(
             'id', pi.id,
             'file_id', f.id,
             'url', '/' || f.bucket || '/' || f.object_key,
             'mime_type', f.mime_type,
             'sort_order', pi.sort_order,
             'is_cover', pi.is_cover
           )
           ORDER BY pi.is_cover DESC, pi.sort_order ASC, pi.created_at ASC
         ) AS images
         FROM product_images pi
         JOIN files f ON f.id = pi.file_id
         WHERE pi.product_id = p.id
       ) i ON true
       WHERE ${where.join(' AND ')}
       ORDER BY p.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    res.json({ products: result.rows, pagination: { limit: input.limit, offset: input.offset } });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const result = await query(
      `SELECT
         p.id,
         p.name,
         p.description,
         p.condition,
         p.price_cents,
         p.currency,
         p.status,
         p.created_at,
         p.updated_at,
         p.published_at,
         json_build_object('id', c.id, 'name', c.name, 'slug', c.slug) AS category,
         json_build_object('id', sp.id, 'display_name', sp.display_name, 'description', sp.description, 'rating_average', sp.rating_average, 'total_sales', sp.total_sales) AS seller,
         CASE WHEN b.id IS NULL THEN NULL ELSE json_build_object('id', b.id, 'name', b.name, 'description', b.description) END AS bazaar,
         COALESCE(v.variants, '[]'::json) AS variants,
         COALESCE(i.images, '[]'::json) AS images,
         COALESCE(v.total_stock, 0)::integer AS total_stock
       FROM products p
       JOIN categories c ON c.id = p.category_id
       JOIN seller_profiles sp ON sp.id = p.seller_id
       LEFT JOIN bazaars b ON b.id = p.bazaar_id
       LEFT JOIN LATERAL (
         SELECT
           json_agg(json_build_object('id', pv.id, 'size_name', pv.size_name, 'stock', pv.stock) ORDER BY pv.size_name) AS variants,
           SUM(pv.stock) AS total_stock
         FROM product_variants pv
         WHERE pv.product_id = p.id
       ) v ON true
       LEFT JOIN LATERAL (
         SELECT json_agg(
           json_build_object(
             'id', pi.id,
             'file_id', f.id,
             'url', '/' || f.bucket || '/' || f.object_key,
             'mime_type', f.mime_type,
             'sort_order', pi.sort_order,
             'is_cover', pi.is_cover
           )
           ORDER BY pi.is_cover DESC, pi.sort_order ASC, pi.created_at ASC
         ) AS images
         FROM product_images pi
         JOIN files f ON f.id = pi.file_id
         WHERE pi.product_id = p.id
       ) i ON true
       WHERE p.id = $1 AND p.status = 'active'`,
      [id],
    );

    if (!result.rows[0]) {
      const error = new Error('Product not found');
      error.status = 404;
      throw error;
    }

    res.json({ product: result.rows[0] });
  } catch (error) {
    if (error.name === 'ZodError') {
      error.status = 400;
      error.message = 'Invalid product id';
    }
    next(error);
  }
});

function parseQuery(schema, queryParams) {
  const parsed = schema.safeParse(queryParams);
  if (!parsed.success) {
    const error = new Error('Invalid query parameters');
    error.status = 400;
    error.details = parsed.error.flatten();
    throw error;
  }
  return parsed.data;
}

module.exports = router;
