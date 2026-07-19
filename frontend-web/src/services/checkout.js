import { post } from './api'

export async function crearCheckout() {
  const data = await post('/checkout', {})
  return data.checkout
}

export async function cancelarCheckout(orderId) {
  const data = await post(`/checkout/${encodeURIComponent(orderId)}/cancel`, {})
  return data.order
}

export async function cancelarCheckoutActivo() {
  const data = await post('/checkout/active/cancel', {})
  const order = data.order
  if (!order) return
  if (order?.status === 'cancelled') return
  if (order?.status !== 'pending_payment') {
    throw new Error('El pago ya fue confirmado. Actualiza tu carrito antes de modificarlo.')
  }
  throw new Error('El pago sigue en proceso. Intenta cancelar nuevamente antes de modificar tu carrito.')
}
