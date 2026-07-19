import { del, get, put } from './api'
import { mapProduct } from './products'

export async function getWishlist({ limit = 24, offset = 0 } = {}) {
  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  const data = await get(`/wishlist?${query}`)
  return {
    products: (data.products || []).map(mapProduct),
    total: Number(data.total || 0),
    pagination: data.pagination,
  }
}

export function saveWishlistItem(productId) {
  return put(`/wishlist/${encodeURIComponent(productId)}`)
}

export function deleteWishlistItem(productId) {
  return del(`/wishlist/${encodeURIComponent(productId)}`)
}
