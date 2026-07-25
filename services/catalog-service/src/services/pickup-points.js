const { createHttpError } = require('@ecobazar/platform');
const { getApprovedSeller } = require('./seller-products');

const PICKUP_POINT_FIELDS = [
  ['name', 'El nombre del punto es obligatorio y no puede superar 160 caracteres.'],
  ['address_line', 'La dirección es obligatoria y no puede superar 255 caracteres.'],
  ['city', 'La ciudad es obligatoria y no puede superar 120 caracteres.'],
  ['state', 'El estado es obligatorio y no puede superar 120 caracteres.'],
  ['postal_code', 'El código postal es obligatorio y no puede superar 20 caracteres.'],
];

async function listSellerPickupPoints(db, user) {
  const seller = await getApprovedSeller(db, user);
  const result = await db.query(
    `SELECT spp.id, spp.seller_id, spp.name, spp.address_line, spp.city,
            spp.state, spp.postal_code, spp.reference, spp.is_active,
            spp.created_at, spp.updated_at,
            count(p.id) FILTER (WHERE p.status <> 'removed')::integer
              AS pending_products_count,
            count(p.id) FILTER (
              WHERE p.status <> 'removed' AND p.status = 'active'
            )::integer AS active_products_count
     FROM seller_pickup_points spp
     LEFT JOIN products p ON p.pickup_point_id = spp.id
     WHERE spp.seller_id = $1
     GROUP BY spp.id
     ORDER BY spp.is_active DESC, spp.created_at DESC, spp.id DESC`,
    [seller.id],
  );
  return { pickup_points: result.rows };
}

async function createSellerPickupPoint(db, user, input) {
  const normalized = normalizePickupPoint(input);
  const seller = await getApprovedSeller(db, user);
  const result = await db.query(
    `INSERT INTO seller_pickup_points
       (seller_id, name, address_line, city, state, postal_code, reference, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, true)
     RETURNING id, seller_id, name, address_line, city, state, postal_code,
               reference, is_active, created_at, updated_at`,
    [seller.id, normalized.name, normalized.address_line, normalized.city,
      normalized.state, normalized.postal_code, normalized.reference],
  );
  return result.rows[0];
}

async function updateSellerPickupPoint(db, user, pointId, input) {
  const normalized = normalizePickupPoint(input, { partial: true });
  return db.transaction(async (client) => {
    const seller = await getApprovedSeller(client, user);
    await lockOwnedPoint(client, pointId, seller.id);
    const updates = [];
    const params = [pointId];
    for (const [field, value] of Object.entries(normalized)) {
      params.push(value);
      updates.push(`${field} = $${params.length}`);
    }
    if (updates.length === 0) {
      throw createHttpError('Debes enviar al menos un campo para editar.', 400, {
        code: 'PICKUP_POINT_NO_CHANGES',
      });
    }
    const result = await client.query(
      `UPDATE seller_pickup_points
       SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $1
       RETURNING id, seller_id, name, address_line, city, state, postal_code,
                 reference, is_active, created_at, updated_at`,
      params,
    );
    return result.rows[0];
  });
}

async function updateSellerPickupPointStatus(db, user, pointId, isActive) {
  if (typeof isActive !== 'boolean') {
    throw createHttpError('El estado del punto no es válido.', 400, {
      code: 'PICKUP_POINT_STATUS_INVALID',
    });
  }
  return db.transaction(async (client) => {
    const seller = await getApprovedSeller(client, user);
    await lockOwnedPoint(client, pointId, seller.id);
    if (!isActive) {
      await client.query(
        `UPDATE products
         SET status = 'paused', updated_at = now()
         WHERE pickup_point_id = $1 AND status = 'active'`,
        [pointId],
      );
    }
    const result = await client.query(
      `UPDATE seller_pickup_points
       SET is_active = $2, updated_at = now()
       WHERE id = $1
       RETURNING id, seller_id, name, address_line, city, state, postal_code,
                 reference, is_active, created_at, updated_at`,
      [pointId, isActive],
    );
    return result.rows[0];
  });
}

async function lockOwnedPoint(client, pointId, sellerId) {
  const result = await client.query(
    `SELECT id
     FROM seller_pickup_points
     WHERE id = $1 AND seller_id = $2
     FOR UPDATE`,
    [pointId, sellerId],
  );
  if (!result.rows[0]) {
    throw createHttpError('El punto de venta no existe o no te pertenece.', 404, {
      code: 'PICKUP_POINT_NOT_FOUND',
    });
  }
  return result.rows[0];
}

function normalizePickupPoint(input, { partial = false } = {}) {
  const source = input || {};
  const output = {};
  for (const [field, message] of PICKUP_POINT_FIELDS) {
    if (partial && source[field] === undefined) continue;
    const value = String(source[field] ?? '').trim();
    const maxLength = field === 'name' ? 160 : field === 'address_line' ? 255
      : field === 'city' || field === 'state' ? 120 : 20;
    if (!value || value.length > maxLength) {
      throw createHttpError(message, 400, { code: 'PICKUP_POINT_VALIDATION_ERROR' });
    }
    output[field] = value;
  }

  if (!partial || source.reference !== undefined) {
    const reference = String(source.reference ?? '').trim();
    if (reference.length > 255) {
      throw createHttpError('La referencia no puede superar 255 caracteres.', 400, {
        code: 'PICKUP_POINT_VALIDATION_ERROR',
      });
    }
    output.reference = reference || null;
  }
  return output;
}

module.exports = {
  createSellerPickupPoint,
  listSellerPickupPoints,
  normalizePickupPoint,
  updateSellerPickupPoint,
  updateSellerPickupPointStatus,
};
