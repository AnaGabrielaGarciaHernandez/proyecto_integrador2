import { del, get, patch, post } from './api'
import { cancelarCheckoutActivo } from './checkout'
import { centsToPesos } from './products'

const PAYMENT_CART_SYNC_ATTEMPTS = 12
const PAYMENT_CART_SYNC_DELAY_MS = 500

export async function getCarrito() {
  const data = await get('/cart')
  return mapCart(data.cart, data.adjustments)
}

export async function reconciliarCarrito() {
  await cancelarCheckoutActivo()
  const data = await post('/cart/reconcile', {})
  const cart = mapCart(data.cart, data.adjustments)
  if (cart.ajustes.length > 0) notifyCartUpdated()
  return cart
}

export async function agregarAlCarrito(variantId, quantity = 1) {
  await cancelarCheckoutActivo()
  const data = await post('/cart/items', {
    variant_id: variantId,
    quantity,
  })
  notifyCartUpdated()
  return mapCart(data.cart, data.adjustments)
}

export async function eliminarDelCarrito(id) {
  await cancelarCheckoutActivo()
  const data = await del(`/cart/items/${id}`)
  notifyCartUpdated()
  return mapCart(data.cart, data.adjustments)
}

export async function cambiarCantidad(id, quantity) {
  await cancelarCheckoutActivo()
  const data = await patch(`/cart/items/${id}`, { quantity })
  notifyCartUpdated()
  return mapCart(data.cart, data.adjustments)
}

export async function contarItems() {
  const cart = await getCarrito()
  return cart.items.reduce((total, item) => total + item.cantidad, 0)
}

export async function sincronizarCarritoDespuesDePago(items = []) {
  const paidVariantIds = new Set(
    (Array.isArray(items) ? items : []).map((item) => item?.variant_id).filter(Boolean),
  )
  let latestCart = null

  for (let attempt = 0; attempt < PAYMENT_CART_SYNC_ATTEMPTS; attempt += 1) {
    try {
      latestCart = await getCarrito()
      const purchasedItemsRemain = paidVariantIds.size > 0
        && latestCart.items.some((item) => paidVariantIds.has(item.variantId))
      if (!purchasedItemsRemain) {
        notifyCartUpdated()
        return latestCart
      }
    } catch {
      // The order event may still be propagating through the backend.
    }

    if (attempt < PAYMENT_CART_SYNC_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, PAYMENT_CART_SYNC_DELAY_MS))
    }
  }

  if (latestCart) notifyCartUpdated()
  return latestCart
}

function mapCart(cart, adjustments = []) {
  const items = (cart?.items || []).map((item) => ({
    id: item.id,
    variantId: item.variant_id,
    productId: item.product_id,
    nombre: item.product_name,
    vendedor: item.seller?.display_name || 'EcoBazar',
    talla: item.size_name,
    cantidad: item.quantity,
    stock: item.stock,
    precio: centsToPesos(item.unit_price_cents),
    precioCentavos: item.unit_price_cents,
    subtotalCentavos: item.line_total_cents,
    imagen: item.cover_image?.url || 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=600',
  }))

  return {
    id: cart?.id,
    items,
    subtotalCentavos: cart?.subtotal_cents || 0,
    totalCentavos: cart?.total_cents || 0,
    currency: cart?.currency || 'MXN',
    ajustes: (adjustments || []).map((adjustment) => ({
      codigo: adjustment.code,
      itemId: adjustment.item_id,
      nombre: adjustment.product_name,
      cantidadAnterior: adjustment.previous_quantity,
      cantidadNueva: adjustment.new_quantity,
    })),
  }
}

function notifyCartUpdated() {
  window.dispatchEvent(new Event('carritoActualizado'))
}
