const { createHttpError } = require('@ecobazar/platform');

async function listProducts(db, input) {
  const params = ['active'];
  const where = ['p.status = $1'];

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
  const result = await db.query(
    `${productSelect()}
     WHERE ${where.join(' AND ')}
     ORDER BY p.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return result.rows;
}

async function getProduct(db, id) {
  const result = await db.query(
    `${productSelect({ detail: true })}
     WHERE p.id = $1 AND p.status = 'active'`,
    [id],
  );
  if (!result.rows[0]) throw createHttpError('Product not found', 404);
  return result.rows[0];
}

async function resolveVariants(db, variantIds) {
  if (variantIds.length === 0) return [];
  const result = await db.query(
    `SELECT
       pv.id AS variant_id,
       pv.product_id,
       pv.size_name,
       pv.stock::integer,
       p.name AS product_name,
       p.price_cents::integer AS unit_price_cents,
       p.currency,
       p.status AS product_status,
       p.seller_id,
       sp.user_id AS seller_user_id,
       sp.display_name AS seller_name,
       sp.status AS seller_status,
       ur.role AS seller_role,
       ur.is_active AS seller_is_active,
       cover.cover_image
     FROM product_variants pv
     JOIN products p ON p.id = pv.product_id
     JOIN seller_profiles sp ON sp.id = p.seller_id
     JOIN user_role_projection ur ON ur.user_id = sp.user_id
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
       ORDER BY pi.is_cover DESC, pi.sort_order, pi.created_at
       LIMIT 1
     ) cover ON true
     WHERE pv.id = ANY($1::uuid[])
     ORDER BY pv.id`,
    [variantIds],
  );
  return result.rows;
}

function productSelect({ detail = false } = {}) {
  return `SELECT
    p.id,
    p.name,
    p.description,
    p.condition,
    p.price_cents::integer,
    p.currency,
    p.status,
    p.created_at,
    ${detail ? 'p.updated_at, p.published_at,' : ''}
    json_build_object('id', c.id, 'name', c.name, 'slug', c.slug) AS category,
    json_build_object(
      'id', sp.id,
      'display_name', sp.display_name,
      ${detail ? "'description', sp.description, 'rating_average', sp.rating_average, 'total_sales', sp.total_sales" : "'rating_average', sp.rating_average"}
    ) AS seller,
    CASE WHEN b.id IS NULL THEN NULL ELSE json_build_object(
      'id', b.id,
      'name', b.name
      ${detail ? ", 'description', b.description" : ''}
    ) END AS bazaar,
    COALESCE(variants.variants, '[]'::json) AS variants,
    COALESCE(images.images, '[]'::json) AS images,
    COALESCE(variants.total_stock, 0)::integer AS total_stock
  FROM products p
  JOIN categories c ON c.id = p.category_id
  JOIN seller_profiles sp ON sp.id = p.seller_id
  LEFT JOIN bazaars b ON b.id = p.bazaar_id
  LEFT JOIN LATERAL (
    SELECT
      json_agg(
        json_build_object('id', pv.id, 'size_name', pv.size_name, 'stock', pv.stock)
        ORDER BY pv.size_name
      ) AS variants,
      sum(pv.stock) AS total_stock
    FROM product_variants pv
    WHERE pv.product_id = p.id
  ) variants ON true
  LEFT JOIN LATERAL (
    SELECT json_agg(
      json_build_object(
        'id', pi.id,
        'file_id', f.id,
        'url', '/' || f.bucket || '/' || f.object_key,
        'mime_type', f.mime_type,
        'sort_order', pi.sort_order,
        'is_cover', pi.is_cover
      ) ORDER BY pi.is_cover DESC, pi.sort_order, pi.created_at
    ) AS images
    FROM product_images pi
    JOIN files f ON f.id = pi.file_id
    WHERE pi.product_id = p.id
  ) images ON true`;
}

module.exports = { listProducts, getProduct, resolveVariants };
