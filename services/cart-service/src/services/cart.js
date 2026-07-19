const { createHttpError } = require('@ecobazar/platform');

async function getCart(db, buyerId) {
  const cart = await getOrCreateCart(db, buyerId);
  return formatCart(cart, await getCartItems(db, cart.id));
}

async function addItem(db, catalogClient, buyerId, input, correlationId) {
  const variants = await catalogClient.resolveVariants(
    [input.variant_id],
    correlationId,
    buyerId,
  );
  const requestedVariantId = input.variant_id.toLowerCase();
  const variant = variants.find(
    ({ variant_id: variantId }) => variantId?.toLowerCase() === requestedVariantId,
  );
  const available = ensureAvailableVariant(variant, input.quantity);

  return db.transaction(async (client) => {
    const cart = await getOrCreateCart(client, buyerId);
    const result = await client.query(
      `INSERT INTO cart_items
         (cart_id, variant_id, product_id, seller_id, seller_user_id, product_name,
          size_name, seller_name, quantity, unit_price_cents, currency, stock_snapshot,
          product_status, cover_image)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::integer, $10::integer, $11,
               $12::integer, $13, $14::jsonb)
       ON CONFLICT (cart_id, variant_id) DO UPDATE
       SET quantity = cart_items.quantity + EXCLUDED.quantity,
           product_id = EXCLUDED.product_id,
           seller_id = EXCLUDED.seller_id,
           seller_user_id = EXCLUDED.seller_user_id,
           product_name = EXCLUDED.product_name,
           size_name = EXCLUDED.size_name,
           seller_name = EXCLUDED.seller_name,
           unit_price_cents = EXCLUDED.unit_price_cents,
           currency = EXCLUDED.currency,
           stock_snapshot = EXCLUDED.stock_snapshot,
           product_status = EXCLUDED.product_status,
           cover_image = EXCLUDED.cover_image
       WHERE cart_items.quantity + EXCLUDED.quantity <= EXCLUDED.stock_snapshot
       RETURNING id`,
      [cart.id, variant.variant_id, variant.product_id, variant.seller_id,
        variant.seller_user_id, variant.product_name, variant.size_name, variant.seller_name,
        input.quantity, variant.unit_price_cents, variant.currency, available,
        variant.product_status, JSON.stringify(variant.cover_image || null)],
    );
    if (!result.rows[0]) {
      throw stockError(available);
    }
    return formatCart(cart, await getCartItems(client, cart.id));
  });
}

async function updateItem(db, catalogClient, buyerId, itemId, quantity, correlationId) {
  return db.transaction(async (client) => {
    const cart = await getOrCreateCart(client, buyerId);
    const locked = await client.query(
      `SELECT id, variant_id, product_name, quantity::integer
       FROM cart_items
       WHERE id = $1 AND cart_id = $2
       FOR UPDATE`,
      [itemId, cart.id],
    );
    const item = locked.rows[0];
    if (!item) {
      throw createHttpError('Este producto ya no está en tu carrito.', 404, {
        code: 'CART_ITEM_NOT_FOUND',
      });
    }

    const [variant] = await catalogClient.resolveVariants(
      [item.variant_id],
      correlationId,
      buyerId,
    );
    const available = availableStock(variant);
    const isIncrease = quantity > item.quantity;
    if (isIncrease && quantity > available) throw stockError(available);

    const adjustments = [];
    if (available === 0) {
      await client.query('DELETE FROM cart_items WHERE id = $1 AND cart_id = $2', [itemId, cart.id]);
      adjustments.push(itemRemovedAdjustment(item));
    } else {
      const nextQuantity = isIncrease ? quantity : Math.min(quantity, available);
      await updateItemSnapshot(client, cart.id, itemId, nextQuantity, available, variant);
      if (nextQuantity !== quantity) {
        adjustments.push(quantityAdjustedAdjustment(item, nextQuantity));
      }
    }

    return {
      cart: formatCart(cart, await getCartItems(client, cart.id)),
      adjustments,
    };
  });
}

async function reconcileCart(db, catalogClient, buyerId, correlationId) {
  return db.transaction(async (client) => {
    const cart = await getOrCreateCart(client, buyerId);
    const locked = await client.query(
      `SELECT id, variant_id, product_name, quantity::integer
       FROM cart_items
       WHERE cart_id = $1
       ORDER BY variant_id
       FOR UPDATE`,
      [cart.id],
    );
    if (locked.rows.length === 0) {
      return {
        cart: formatCart(cart, []),
        adjustments: [],
      };
    }

    const variants = await catalogClient.resolveVariants(
      locked.rows.map((item) => item.variant_id),
      correlationId,
      buyerId,
    );
    const variantsById = new Map(variants.map((variant) => [variant.variant_id, variant]));
    const adjustments = [];

    for (const item of locked.rows) {
      const variant = variantsById.get(item.variant_id);
      const available = availableStock(variant);
      if (available === 0) {
        await client.query(
          'DELETE FROM cart_items WHERE id = $1 AND cart_id = $2',
          [item.id, cart.id],
        );
        adjustments.push(itemRemovedAdjustment(item));
        continue;
      }

      const nextQuantity = Math.min(item.quantity, available);
      await updateItemSnapshot(client, cart.id, item.id, nextQuantity, available, variant);
      if (nextQuantity !== item.quantity) {
        adjustments.push(quantityAdjustedAdjustment(item, nextQuantity));
      }
    }

    return {
      cart: formatCart(cart, await getCartItems(client, cart.id)),
      adjustments,
    };
  });
}

async function deleteItem(db, buyerId, itemId) {
  return db.transaction(async (client) => {
    const cart = await getOrCreateCart(client, buyerId);
    await client.query('DELETE FROM cart_items WHERE id = $1 AND cart_id = $2', [itemId, cart.id]);
    return formatCart(cart, await getCartItems(client, cart.id));
  });
}

async function getCartSnapshot(db, buyerId) {
  const cart = await getOrCreateCart(db, buyerId);
  const items = await getCartItems(db, cart.id);
  const subtotal = items.reduce((sum, item) => sum + Number(item.line_total_cents), 0);
  const currencies = [...new Set(items.map((item) => item.currency))];
  return {
    cart_id: cart.id,
    buyer_id: cart.buyer_id,
    currency: currencies.length === 1 ? currencies[0] : null,
    items: items.map((item) => ({
      cart_item_id: item.id,
      variant_id: item.variant_id,
      product_id: item.product_id,
      seller_id: item.seller_id,
      seller_user_id: item.seller_user_id,
      product_name: item.product_name,
      size_name: item.size_name,
      seller_name: item.seller_name,
      quantity: item.quantity,
      unit_price_cents: item.unit_price_cents,
      currency: item.currency,
      image_url: item.cover_image?.url || null,
    })),
    subtotal_cents: subtotal,
    total_cents: subtotal,
  };
}

async function getOrCreateCart(client, buyerId) {
  await client.query(
    `INSERT INTO shopping_carts (buyer_id)
     VALUES ($1)
     ON CONFLICT (buyer_id) DO NOTHING`,
    [buyerId],
  );
  const result = await client.query(
    'SELECT id, buyer_id, created_at, updated_at FROM shopping_carts WHERE buyer_id = $1',
    [buyerId],
  );
  return result.rows[0];
}

async function getCartItems(client, cartId) {
  const result = await client.query(
    `SELECT
       id,
       variant_id,
       product_id,
       seller_id,
       seller_user_id,
       product_name,
       size_name,
       seller_name,
       quantity::integer,
       unit_price_cents::integer,
       (quantity * unit_price_cents)::integer AS line_total_cents,
       currency,
       stock_snapshot::integer AS stock,
       product_status,
       cover_image,
       created_at,
       updated_at
     FROM cart_items
     WHERE cart_id = $1
     ORDER BY created_at, id`,
    [cartId],
  );
  return result.rows;
}

function formatCart(cart, items) {
  const subtotal = items.reduce((sum, item) => sum + Number(item.line_total_cents), 0);
  return {
    id: cart.id,
    user_id: cart.buyer_id,
    items: items.map((item) => ({
      id: item.id,
      variant_id: item.variant_id,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price_cents: item.unit_price_cents,
      line_total_cents: item.line_total_cents,
      size_name: item.size_name,
      stock: item.stock,
      product_name: item.product_name,
      current_price_cents: item.unit_price_cents,
      currency: item.currency,
      seller: { id: item.seller_id, display_name: item.seller_name },
      cover_image: item.cover_image,
      created_at: item.created_at,
      updated_at: item.updated_at,
    })),
    subtotal_cents: subtotal,
    total_cents: subtotal,
    currency: items[0]?.currency || 'MXN',
  };
}

function ensureAvailableVariant(variant, quantity) {
  if (!isAvailableVariant(variant)) {
    throw createHttpError('Este producto ya no está disponible.', 404, {
      code: 'PRODUCT_UNAVAILABLE',
    });
  }
  const available = availableStock(variant);
  if (quantity > available) throw stockError(available);
  return available;
}

function isAvailableVariant(variant) {
  return Boolean(variant)
    && variant.product_status === 'active'
    && variant.seller_status === 'approved'
    && variant.seller_role === 'vendedor'
    && variant.seller_is_active === true;
}

function availableStock(variant) {
  if (!isAvailableVariant(variant)) return 0;
  const stock = Number(variant.stock);
  const reserved = Number(variant.buyer_reserved_quantity || 0);
  const safeStock = Number.isInteger(stock) && stock > 0 ? stock : 0;
  const safeReserved = Number.isInteger(reserved) && reserved > 0 ? reserved : 0;
  return safeStock + safeReserved;
}

async function updateItemSnapshot(client, cartId, itemId, quantity, available, variant) {
  await client.query(
    `UPDATE cart_items
     SET quantity = $1::integer,
         product_id = $2,
         seller_id = $3,
         seller_user_id = $4,
         product_name = $5,
         size_name = $6,
         seller_name = $7,
         unit_price_cents = $8::integer,
         currency = $9,
         stock_snapshot = $10::integer,
         product_status = $11,
         cover_image = $12::jsonb
     WHERE id = $13 AND cart_id = $14`,
    [quantity, variant.product_id, variant.seller_id, variant.seller_user_id,
      variant.product_name, variant.size_name, variant.seller_name, variant.unit_price_cents,
      variant.currency, available, variant.product_status,
      JSON.stringify(variant.cover_image || null), itemId, cartId],
  );
}

function quantityAdjustedAdjustment(item, nextQuantity) {
  return {
    code: 'CART_QUANTITY_ADJUSTED',
    item_id: item.id,
    product_name: item.product_name,
    previous_quantity: item.quantity,
    new_quantity: nextQuantity,
  };
}

function itemRemovedAdjustment(item) {
  return {
    code: 'CART_ITEM_REMOVED',
    item_id: item.id,
    product_name: item.product_name,
    previous_quantity: item.quantity,
    new_quantity: 0,
  };
}

function stockError(available) {
  return createHttpError('No hay suficientes unidades disponibles para completar esta acción.', 409, {
    code: 'STOCK_UNAVAILABLE',
    available: Math.max(0, Number(available) || 0),
  });
}

module.exports = {
  getCart,
  addItem,
  updateItem,
  reconcileCart,
  deleteItem,
  getCartSnapshot,
  getOrCreateCart,
  formatCart,
  ensureAvailableVariant,
};
