import { del, get, patch, post } from './api'

export async function getCategories() {
  const data = await get('/categories')
  return data?.categories || []
}

export async function getSellerProducts({ search = '', status = '', limit = 25, offset = 0 } = {}) {
  const params = new URLSearchParams({ search, limit: String(limit), offset: String(offset) })
  if (status) params.set('status', status)
  return get(`/seller/products?${params.toString()}`)
}

export async function createSellerProduct(formData) {
  return post('/seller/products', formData)
}

export async function updateSellerProduct(id, payload) {
  return patch(`/seller/products/${id}`, payload)
}

export async function updateSellerProductStatus(id, status) {
  return patch(`/seller/products/${id}/status`, { status })
}

export async function addSellerProductImages(id, formData) {
  return post(`/seller/products/${id}/images`, formData)
}

export async function deleteSellerProductImage(productId, imageId) {
  return del(`/seller/products/${productId}/images/${imageId}`)
}

export async function reorderSellerProductImages(productId, imageIds) {
  return patch(`/seller/products/${productId}/images/order`, { image_ids: imageIds })
}

export async function setSellerProductCover(productId, imageId) {
  return patch(`/seller/products/${productId}/images/${imageId}/cover`, {})
}

export async function getSellerSales({ search = '', limit = 25, offset = 0 } = {}) {
  const params = new URLSearchParams({ search, limit: String(limit), offset: String(offset) })
  return get(`/seller/sales?${params.toString()}`)
}
