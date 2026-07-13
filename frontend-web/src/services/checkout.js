import { post } from './api'

export async function crearCheckout() {
  const data = await post('/checkout', {})
  return data.checkout
}

export async function cancelarCheckout(orderId) {
  const data = await post(`/checkout/${encodeURIComponent(orderId)}/cancel`, {})
  return data.order
}
