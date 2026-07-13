import { get } from './api'

export async function getOrdersForUser(user) {
  if (!user) return []
  const path = user.role === 'vendedor' ? '/seller/orders' : '/orders'
  const data = await get(path)
  return data.orders || []
}

export async function getOrder(orderId) {
  const data = await get(`/orders/${encodeURIComponent(orderId)}`)
  return data.order
}
