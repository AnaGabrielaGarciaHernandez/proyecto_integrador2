const { randomUUID } = require('node:crypto');
const { z } = require('zod');
const { createHttpError } = require('@ecobazar/platform');
const { productSelect } = require('./products');
const { processProductImages } = require('./product-images');

const PRODUCT_CONDITIONS = Object.freeze([
  'nuevo',
  'como nuevo',
  'buen estado',
  'usado',
  'muy usado',
]);
const PRODUCT_STATUSES = Object.freeze(['draft', 'active', 'paused', 'sold', 'removed']);
const EDITABLE_STATUSES = Object.freeze(['active', 'paused', 'removed']);
const UUID_SCHEMA = z.string().uuid();

async function listSellerProducts(db, user, input) {
  await getApprovedSeller(db, user);

  const params = [user.id];
  const where = ['sp.user_id = $1'];
  if (input.search) {
    params.push(`%${input.search}%`);
    where.push(`(p.name ILIKE $${params.length} OR p.description ILIKE $${params.length})`);
  }
  if (input.status) {
    params.push(input.status);
    where.push(`p.status = $${params.length}`);
  }

  const countResult = await db.query(
    `SELECT count(*)::integer AS total
     FROM products p
     JOIN seller_profiles sp ON sp.id = p.seller_id
     WHERE ${where.join(' AND ')}`,
    params,
  );
  const total = Number(countResult.rows[0]?.total || 0);
  params.push(input.limit, input.offset);
  const result = await db.query(
    `${productSelect({ detail: true })}
     WHERE ${where.join(' AND ')}
     ORDER BY p.created_at DESC, p.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    products: result.rows,
    total,
    pagination: {
      limit: input.limit,
      offset: input.offset,
      has_more: input.offset + result.rows.length < total,
    },
  };
}

async function getSellerProduct(db, user, productId, executor = db) {
  await getApprovedSeller(executor, user);
  const result = await executor.query(
    `${productSelect({ detail: true })}
     WHERE p.id = $1 AND sp.user_id = $2`,
    [productId, user.id],
  );
  if (!result.rows[0]) throw productNotFound();
  return result.rows[0];
}

async function createSellerProduct(db, storage, config, user, input, files) {
  await getApprovedSeller(db, user);
  const normalized = normalizeCreateInput(input);
  await validateCategory(db, normalized.categoryId);
  const processedImages = await processProductImages(files, config);
  if (!storage) throw storageUnavailable();

  const productId = randomUUID();
  const uploaded = [];
  try {
    for (const image of processedImages) {
      const stored = await storage.upload({
        sellerUserId: user.id,
        productId,
        buffer: image.buffer,
      });
      uploaded.push({ ...stored, image });
    }

    await db.transaction(async (client) => {
      const seller = await getApprovedSeller(client, user);
      await validateCategory(client, normalized.categoryId);
      await client.query(
        `INSERT INTO products
           (id, seller_id, category_id, name, description, condition, price_cents,
            currency, status, published_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'MXN', 'active', now())`,
        [productId, seller.id, normalized.categoryId, normalized.name,
          normalized.description, normalized.condition, normalized.priceCents],
      );

      for (const variant of normalized.variants) {
        await client.query(
          `INSERT INTO product_variants (product_id, size_name, stock)
           VALUES ($1, $2, $3)`,
          [productId, variant.sizeName, variant.stock],
        );
      }

      for (const [sortOrder, item] of uploaded.entries()) {
        const fileResult = await client.query(
          `INSERT INTO files
             (storage_provider, bucket, object_key, public_url, original_name,
              mime_type, size_bytes, visibility, uploaded_by)
           VALUES ('supabase_storage', $1, $2, $3, $4, 'image/webp', $5, 'public_read', $6)
           RETURNING id`,
          [item.bucket, item.objectKey, item.publicUrl, item.image.originalName,
            item.image.buffer.length, user.id],
        );
        await client.query(
          `INSERT INTO product_images (product_id, file_id, sort_order, is_cover)
           VALUES ($1, $2, $3, $4)`,
          [productId, fileResult.rows[0].id, sortOrder, sortOrder === 0],
        );
      }
    });
  } catch (error) {
    await cleanupUploaded(storage, uploaded);
    throw error;
  }

  return getSellerProduct(db, user, productId);
}

async function updateSellerProduct(db, user, productId, input) {
  const normalized = normalizeUpdateInput(input);
  return db.transaction(async (client) => {
    const seller = await getApprovedSeller(client, user);
    const current = await lockOwnedProduct(client, productId, seller.id);
    if (current.status === 'removed') {
      throw createHttpError('Una publicación retirada no puede editarse.', 409, {
        code: 'PRODUCT_REMOVED',
      });
    }

    if (normalized.categoryId) await validateCategory(client, normalized.categoryId);
    if (normalized.variants) {
      await updateVariants(client, productId, normalized.variants);
    }

    const updates = [];
    const params = [productId];
    for (const [column, value] of [
      ['name', normalized.name],
      ['description', normalized.description],
      ['condition', normalized.condition],
      ['price_cents', normalized.priceCents],
      ['category_id', normalized.categoryId],
    ]) {
      if (value !== undefined) {
        params.push(value);
        updates.push(`${column} = $${params.length}`);
      }
    }
    if (updates.length > 0) {
      await client.query(
        `UPDATE products SET ${updates.join(', ')}, updated_at = now()
         WHERE id = $1`,
        params,
      );
    }

    return getSellerProduct(db, user, productId, client);
  });
}

async function updateSellerProductStatus(db, storage, user, productId, status) {
  if (!EDITABLE_STATUSES.includes(status)) {
    throw createHttpError('Estado de publicación no válido.', 400, {
      code: 'PRODUCT_STATUS_INVALID',
    });
  }

  let objectKeys = [];
  let result;
  await db.transaction(async (client) => {
    const seller = await getApprovedSeller(client, user);
    const current = await lockOwnedProduct(client, productId, seller.id);
    if (current.status === 'removed' && status !== 'removed') {
      throw createHttpError('Una publicación retirada no puede reactivarse.', 409, {
        code: 'PRODUCT_REMOVED',
      });
    }
    if (status === 'active') {
      const stock = await client.query(
        `SELECT COALESCE(sum(stock), 0)::integer AS total_stock
         FROM product_variants WHERE product_id = $1`,
        [productId],
      );
      if (Number(stock.rows[0]?.total_stock || 0) <= 0) {
        throw createHttpError('Agrega stock antes de reactivar la publicación.', 409, {
          code: 'PRODUCT_STOCK_REQUIRED',
        });
      }
    }

    if (status === 'removed' && current.status !== 'removed') {
      const images = await client.query(
        `SELECT f.object_key
         FROM product_images pi JOIN files f ON f.id = pi.file_id
         WHERE pi.product_id = $1`,
        [productId],
      );
      objectKeys = images.rows.map((row) => row.object_key);
      await client.query('DELETE FROM product_images WHERE product_id = $1', [productId]);
    }

    await client.query(
      `UPDATE products
       SET status = $2,
           published_at = CASE WHEN $2 = 'active' THEN COALESCE(published_at, now()) ELSE published_at END,
           removed_at = CASE WHEN $2 = 'removed' THEN COALESCE(removed_at, now()) ELSE NULL END,
           updated_at = now()
       WHERE id = $1`,
      [productId, status],
    );
    result = await getSellerProduct(db, user, productId, client);
  });

  if (objectKeys.length > 0 && storage) {
    try {
      await storage.remove(objectKeys);
    } catch (error) {
      console.warn('[catalog-service] product image cleanup failed', error.details?.code || error.message);
    }
  }
  return result;
}

async function addSellerProductImages(db, storage, config, user, productId, files) {
  if (!storage) throw storageUnavailable();
  const processed = await processProductImages(files, config);
  const uploaded = [];
  try {
    const result = await db.transaction(async (client) => {
      const seller = await getApprovedSeller(client, user);
      const current = await lockOwnedProduct(client, productId, seller.id);
      if (current.status === 'removed') throw productRemoved();
      const countResult = await client.query(
        'SELECT count(*)::integer AS count FROM product_images WHERE product_id = $1',
        [productId],
      );
      const currentCount = Number(countResult.rows[0]?.count || 0);
      const maxFiles = Number(config.PRODUCT_IMAGE_MAX_FILES || 8);
      if (currentCount + processed.length > maxFiles) {
        throw createHttpError(`Una publicación puede tener hasta ${maxFiles} imágenes.`, 400, {
          code: 'PRODUCT_IMAGE_COUNT_EXCEEDED',
        });
      }

      for (const image of processed) {
        const stored = await storage.upload({
          sellerUserId: user.id,
          productId,
          buffer: image.buffer,
        });
        uploaded.push({ ...stored, image });
      }

      for (const [index, item] of uploaded.entries()) {
        const fileResult = await client.query(
          `INSERT INTO files
             (storage_provider, bucket, object_key, public_url, original_name,
              mime_type, size_bytes, visibility, uploaded_by)
           VALUES ('supabase_storage', $1, $2, $3, $4, 'image/webp', $5, 'public_read', $6)
           RETURNING id`,
          [item.bucket, item.objectKey, item.publicUrl, item.image.originalName,
            item.image.buffer.length, user.id],
        );
        await client.query(
          `INSERT INTO product_images (product_id, file_id, sort_order, is_cover)
           VALUES ($1, $2, $3, $4)`,
          [productId, fileResult.rows[0].id, currentCount + index, currentCount === 0 && index === 0],
        );
      }
      return getSellerProduct(db, user, productId, client);
    });
    return result;
  } catch (error) {
    await cleanupUploaded(storage, uploaded);
    throw error;
  }
}

async function deleteSellerProductImage(db, storage, user, productId, imageId) {
  let objectKey = null;
  let result;
  await db.transaction(async (client) => {
    const seller = await getApprovedSeller(client, user);
    await lockOwnedProduct(client, productId, seller.id);
    const imageResult = await client.query(
      `SELECT pi.id, pi.is_cover, f.id AS file_id, f.object_key
       FROM product_images pi JOIN files f ON f.id = pi.file_id
       WHERE pi.id = $1 AND pi.product_id = $2`,
      [imageId, productId],
    );
    const image = imageResult.rows[0];
    if (!image) throw imageNotFound();
    const countResult = await client.query(
      'SELECT count(*)::integer AS count FROM product_images WHERE product_id = $1',
      [productId],
    );
    if (Number(countResult.rows[0]?.count || 0) <= 1) {
      throw createHttpError('Una publicación debe conservar al menos una imagen.', 409, {
        code: 'PRODUCT_IMAGES_REQUIRED',
      });
    }
    objectKey = image.object_key;
    await client.query('DELETE FROM product_images WHERE id = $1', [imageId]);
    if (image.is_cover) {
      await client.query(
        `UPDATE product_images
         SET is_cover = true
         WHERE id = (
           SELECT id FROM product_images
           WHERE product_id = $1
           ORDER BY sort_order, created_at
           LIMIT 1
         )`,
        [productId],
      );
    }
    result = await getSellerProduct(db, user, productId, client);
  });
  if (objectKey && storage) {
    try {
      await storage.remove([objectKey]);
    } catch (error) {
      console.warn('[catalog-service] deleted product image cleanup failed', error.details?.code || error.message);
    }
  }
  return result;
}

async function reorderSellerProductImages(db, user, productId, imageIds) {
  if (!Array.isArray(imageIds) || imageIds.length === 0) {
    throw createHttpError('Debes enviar el orden completo de las imágenes.', 400, {
      code: 'PRODUCT_IMAGE_ORDER_INVALID',
    });
  }
  return db.transaction(async (client) => {
    const seller = await getApprovedSeller(client, user);
    await lockOwnedProduct(client, productId, seller.id);
    const existing = await client.query(
      'SELECT id FROM product_images WHERE product_id = $1 ORDER BY id',
      [productId],
    );
    const expected = new Set(existing.rows.map((row) => row.id));
    if (imageIds.length !== expected.size || imageIds.some((id) => !expected.has(id))) {
      throw createHttpError('El orden debe incluir exactamente las imágenes de la publicación.', 400, {
        code: 'PRODUCT_IMAGE_ORDER_INVALID',
      });
    }
    for (const [sortOrder, imageId] of imageIds.entries()) {
      await client.query(
        'UPDATE product_images SET sort_order = $3 WHERE id = $1 AND product_id = $2',
        [imageId, productId, sortOrder],
      );
    }
    return getSellerProduct(db, user, productId, client);
  });
}

async function setSellerProductCover(db, user, productId, imageId) {
  return db.transaction(async (client) => {
    const seller = await getApprovedSeller(client, user);
    await lockOwnedProduct(client, productId, seller.id);
    const image = await client.query(
      'SELECT id FROM product_images WHERE id = $1 AND product_id = $2',
      [imageId, productId],
    );
    if (!image.rows[0]) throw imageNotFound();
    await client.query('UPDATE product_images SET is_cover = false WHERE product_id = $1', [productId]);
    await client.query(
      'UPDATE product_images SET is_cover = true WHERE id = $1 AND product_id = $2',
      [imageId, productId],
    );
    return getSellerProduct(db, user, productId, client);
  });
}

async function getApprovedSeller(executor, user) {
  if (!user?.id || user.role !== 'vendedor') {
    throw createHttpError('Solo los vendedores pueden administrar publicaciones.', 403, {
      code: 'SELLER_REQUIRED',
    });
  }
  const result = await executor.query(
    `SELECT sp.id, sp.user_id, sp.display_name
     FROM seller_profiles sp
     JOIN user_role_projection ur ON ur.user_id = sp.user_id
     WHERE sp.user_id = $1
       AND ur.role = 'vendedor'
       AND ur.is_active IS TRUE
       AND sp.status = 'approved'`,
    [user.id],
  );
  if (!result.rows[0]) {
    throw createHttpError('Tu perfil de vendedor debe estar aprobado para publicar.', 403, {
      code: 'SELLER_NOT_APPROVED',
    });
  }
  return result.rows[0];
}

async function lockOwnedProduct(client, productId, sellerId) {
  const result = await client.query(
    `SELECT id, seller_id, status
     FROM products
     WHERE id = $1 AND seller_id = $2
     FOR UPDATE`,
    [productId, sellerId],
  );
  if (!result.rows[0]) throw productNotFound();
  return result.rows[0];
}

async function validateCategory(executor, categoryId) {
  const result = await executor.query(
    'SELECT id FROM categories WHERE id = $1 AND is_active IS TRUE',
    [categoryId],
  );
  if (!result.rows[0]) {
    throw createHttpError('La categoría seleccionada no existe.', 400, {
      code: 'CATEGORY_INVALID',
    });
  }
}

async function updateVariants(client, productId, variants) {
  const existingResult = await client.query(
    'SELECT id FROM product_variants WHERE product_id = $1 ORDER BY id',
    [productId],
  );
  const existingIds = new Set(existingResult.rows.map((row) => row.id));
  const incomingIds = new Set();
  for (const variant of variants) {
    if (variant.id) {
      if (!existingIds.has(variant.id) || incomingIds.has(variant.id)) {
        throw createHttpError('Una variante no pertenece a esta publicación.', 403, {
          code: 'VARIANT_NOT_OWNED',
        });
      }
      incomingIds.add(variant.id);
    }
  }

  const deletedIds = [...existingIds].filter((id) => !incomingIds.has(id));
  if (deletedIds.length > 0) {
    const reserved = await client.query(
      `SELECT 1 FROM inventory_reservation_items
       WHERE variant_id = ANY($1::uuid[]) LIMIT 1`,
      [deletedIds],
    );
    if (reserved.rows[0]) {
      throw createHttpError('No puedes eliminar una variante con una reserva activa.', 409, {
        code: 'VARIANT_RESERVED',
      });
    }
    await client.query(
      'DELETE FROM product_variants WHERE product_id = $1 AND id = ANY($2::uuid[])',
      [productId, deletedIds],
    );
  }

  for (const variant of variants) {
    if (variant.id) {
      await client.query(
        `UPDATE product_variants
         SET size_name = $2, stock = $3, updated_at = now()
         WHERE id = $1 AND product_id = $4`,
        [variant.id, variant.sizeName, variant.stock, productId],
      );
    } else {
      await client.query(
        `INSERT INTO product_variants (product_id, size_name, stock)
         VALUES ($1, $2, $3)`,
        [productId, variant.sizeName, variant.stock],
      );
    }
  }
}

function normalizeCreateInput(input) {
  const normalized = normalizeUpdateInput(input, { required: true });
  if (!normalized.variants || normalized.variants.length === 0) {
    throw createHttpError('Agrega al menos una variante.', 400, { code: 'VARIANTS_REQUIRED' });
  }
  return normalized;
}

function normalizeUpdateInput(input, { required = false } = {}) {
  const source = input || {};
  const output = {};
  const name = source.name === undefined ? undefined : String(source.name).trim();
  const description = source.description === undefined ? undefined : String(source.description).trim();
  const condition = source.condition === undefined ? undefined : String(source.condition).trim().toLowerCase();
  const categoryId = source.category_id === undefined ? undefined : String(source.category_id).trim();

  if (required || name !== undefined) {
    if (!name || name.length > 180) throw invalidProduct('El nombre es obligatorio y no puede superar 180 caracteres.');
    output.name = name;
  }
  if (required || description !== undefined) {
    if (!description || description.length > 5000) throw invalidProduct('La descripción es obligatoria y no puede superar 5000 caracteres.');
    output.description = description;
  }
  if (required || condition !== undefined) {
    if (!PRODUCT_CONDITIONS.includes(condition)) throw invalidProduct('La condición de la prenda no es válida.');
    output.condition = condition;
  }
  if (required || source.price !== undefined || source.price_mxn !== undefined || source.price_cents !== undefined) {
    output.priceCents = parsePrice(source);
  }
  if (required || categoryId !== undefined) {
    const parsedCategory = UUID_SCHEMA.safeParse(categoryId);
    if (!parsedCategory.success) throw invalidProduct('La categoría es obligatoria.');
    output.categoryId = parsedCategory.data;
  }
  if (required || source.variants !== undefined) {
    output.variants = normalizeVariants(source.variants);
  }
  if (!required && Object.keys(output).length === 0) {
    throw invalidProduct('Debes enviar al menos un campo para editar.');
  }
  return output;
}

function normalizeVariants(value) {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      throw invalidProduct('Las variantes no tienen un formato válido.');
    }
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 40) {
    throw createHttpError('Debes agregar entre 1 y 40 variantes.', 400, { code: 'VARIANTS_INVALID' });
  }
  const seen = new Set();
  const variants = parsed.map((variant) => {
    const sizeName = String(variant?.size_name ?? variant?.sizeName ?? '').trim();
    const stock = Number(variant?.stock);
    let id;
    if (variant?.id !== undefined && variant?.id !== null && variant.id !== '') {
      const parsedId = UUID_SCHEMA.safeParse(String(variant.id));
      if (!parsedId.success) throw invalidProduct('El identificador de una variante no es válido.');
      id = parsedId.data;
    }
    if (!sizeName || sizeName.length > 40 || !Number.isInteger(stock) || stock < 0) {
      throw invalidProduct('Cada variante debe tener talla y stock válido.');
    }
    const key = sizeName.toLocaleLowerCase();
    if (seen.has(key)) throw invalidProduct('No puedes repetir una talla o variante.');
    seen.add(key);
    return { id, sizeName, stock };
  });
  if (variants.every((variant) => variant.stock <= 0)) {
    throw createHttpError('Agrega stock positivo en al menos una variante.', 400, {
      code: 'STOCK_REQUIRED',
    });
  }
  return variants;
}

function parsePrice(source) {
  const raw = source.price_mxn ?? source.price ?? source.price_cents;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    throw invalidProduct('El precio es obligatorio.');
  }
  if (source.price_cents !== undefined && source.price_mxn === undefined && source.price === undefined) {
    const cents = Number(raw);
    if (!Number.isInteger(cents) || cents <= 0 || cents > 100000000) throw invalidProduct('El precio debe ser positivo.');
    return cents;
  }
  const text = String(raw).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw invalidProduct('El precio debe ser una cantidad válida en MXN.');
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0 || value > 1000000) throw invalidProduct('El precio debe ser positivo.');
  return Math.round(value * 100);
}

function invalidProduct(message) {
  return createHttpError(message, 400, { code: 'PRODUCT_VALIDATION_ERROR' });
}

function productNotFound() {
  return createHttpError('La publicación no existe o no te pertenece.', 404, {
    code: 'PRODUCT_NOT_FOUND',
  });
}

function productRemoved() {
  return createHttpError('Una publicación retirada ya no puede modificarse.', 409, {
    code: 'PRODUCT_REMOVED',
  });
}

function imageNotFound() {
  return createHttpError('La imagen no existe o no pertenece a esta publicación.', 404, {
    code: 'PRODUCT_IMAGE_NOT_FOUND',
  });
}

function storageUnavailable() {
  return createHttpError(
    'El almacenamiento de imágenes no está configurado.',
    503,
    { code: 'PRODUCT_STORAGE_UNAVAILABLE' },
  );
}

async function cleanupUploaded(storage, uploaded) {
  if (!storage || uploaded.length === 0) return;
  try {
    await storage.remove(uploaded.map((item) => item.objectKey));
  } catch (error) {
    console.warn('[catalog-service] product upload compensation failed', error.details?.code || error.message);
  }
}

module.exports = {
  EDITABLE_STATUSES,
  PRODUCT_CONDITIONS,
  PRODUCT_STATUSES,
  addSellerProductImages,
  createSellerProduct,
  deleteSellerProductImage,
  getApprovedSeller,
  getSellerProduct,
  listSellerProducts,
  normalizeCreateInput,
  normalizeUpdateInput,
  reorderSellerProductImages,
  setSellerProductCover,
  updateSellerProduct,
  updateSellerProductStatus,
};
