const { createHttpError } = require('@ecobazar/platform');

async function getCart(db, buyerId) {
  const cart = await getOrCreateCart(db, buyerId);
  return formatCart(cart, await getCartItems(db, cart.id));
}

async function addItem(db, catalogClient, buyerId, input, correlationId) {
  const [variant] = await catalogClient.resolveVariants([input.variant_id], correlationId);
  ensureAvailableVariant(variant, input.quantity, input.variant_id);

  return db.transaction(async (client) => {
    const cart = await getOrCreateCart(client, buyerId);
    const result = await client.query(
      `INSERT INTO cart_items
         (cart_id, variant_id, product_id, seller_id, seller_user_id, product_name,
          size_name, seller_name, quantity, unit_price_cents, currency, stock_snapshot,
          product_status, cover_image)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
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
        input.quantity, variant.unit_price_cents, variant.currency, variant.stock,
        variant.product_status, JSON.stringify(variant.cover_image || null)],
    );
    if (!result.rows[0]) {
      const current = await client.query(
        'SELECT quantity FROM cart_items WHERE cart_id = $1 AND variant_id = $2',
        [cart.id, input.variant_id],
      );
      throw stockError((current.rows[0]?.quantity || 0) + input.quantity, variant.stock);
    }
    return formatCart(cart, await getCartItems(client, cart.id));
  });
}

async function updateItem(db, catalogClient, buyerId, itemId, quantity, correlationId) {
  const owned = await db.query(
    `SELECT ci.variant_id
     FROM cart_items ci
     JOIN shopping_carts sc ON sc.id = ci.cart_id
     WHERE ci.id = $1 AND sc.buyer_id = $2`,
    [itemId, buyerId],
  );
  if (!owned.rows[0]) throw createHttpError('Cart item not found', 404);

  const [variant] = await catalogClient.resolveVariants([owned.rows[0].variant_id], correlationId);
  ensureAvailableVariant(variant, quantity, owned.rows[0].variant_id);

  return db.transaction(async (client) => {
    const cart = await getOrCreateCart(client, buyerId);
    const updated = await client.query(
      `UPDATE cart_items
       SET quantity = $1,
           stock_snapshot = $2,
           product_status = $3,
           product_name = $4,
           size_name = $5,
           seller_name = $6,
           cover_image = $7::jsonb
       WHERE id = $8 AND cart_id = $9 AND $1 <= $2
       RETURNING id`,
      [quantity, variant.stock, variant.product_status, variant.product_name,
        variant.size_name, variant.seller_name, JSON.stringify(variant.cover_image || null),
        itemId, cart.id],
    );
    if (!updated.rows[0]) throw createHttpError('Cart item not found', 404);
    return formatCart(cart, await getCartItems(client, cart.id));
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

function ensureAvailableVariant(variant, quantity, variantId) {
  if (!variant || variant.product_status !== 'active'
    || variant.seller_status !== 'approved'
    || variant.seller_role !== 'vendedor'
    || variant.seller_is_active !== true) {
    throw createHttpError('Variant not found', 404, { variant_id: variantId });
  }
  if (quantity > variant.stock) throw stockError(quantity, variant.stock);
}

function stockError(requested, available) {
  return createHttpError('Requested quantity exceeds available stock', 409, {
    code: 'STOCK_UNAVAILABLE',
    requested,
    available,
  });
}

module.exports = {
  getCart,
  addItem,
  updateItem,
  deleteItem,
  getCartSnapshot,
  getOrCreateCart,
  formatCart,
  ensureAvailableVariant,
};
