import { del, get, patch, post } from './api'
import { centsToPesos } from './products'

export async function getCarrito() {
  const data = await get('/cart')
  return mapCart(data.cart)
}

export async function agregarAlCarrito(variantId, quantity = 1) {
  const data = await post('/cart/items', {
    variant_id: variantId,
    quantity,
  })
  notifyCartUpdated()
  return mapCart(data.cart)
}

export async function eliminarDelCarrito(id) {
  const data = await del(`/cart/items/${id}`)
  notifyCartUpdated()
  return mapCart(data.cart)
}

export async function cambiarCantidad(id, quantity) {
  const data = await patch(`/cart/items/${id}`, { quantity })
  notifyCartUpdated()
  return mapCart(data.cart)
}

export async function contarItems() {
  const cart = await getCarrito()
  return cart.items.reduce((total, item) => total + item.cantidad, 0)
}

function mapCart(cart) {
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
  }
}

function notifyCartUpdated() {
  window.dispatchEvent(new Event('carritoActualizado'))
}
