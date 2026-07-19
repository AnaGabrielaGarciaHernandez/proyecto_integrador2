import { get } from './api'

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=900'

export async function getProducts(params = {}) {
  const query = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, value)
    }
  })

  const suffix = query.toString() ? `?${query.toString()}` : ''
  const data = await get(`/products${suffix}`)
  const products = (data.products || []).map(mapProduct)
  return {
    products: products.filter((product) => product.availabilityStatus !== 'unavailable'),
    pagination: data.pagination,
  }
}

export async function getProduct(id) {
  const data = await get(`/products/${id}`)
  const product = mapProduct(data.product)
  if (product.availabilityStatus === 'unavailable') {
    const error = new Error('Este producto ya no está disponible.')
    error.status = 404
    throw error
  }
  return product
}

export function mapProduct(product) {
  const variants = product.variants || []
  const firstAvailableVariant = variants.find((variant) => variant.stock > 0) || null
  const price = centsToPesos(product.price_cents)
  const totalStock = Number(product.total_stock || 0)
  const availabilityStatus = product.availability_status
    || (totalStock > 0 ? 'available' : 'unavailable')
  const temporarilyUnavailable = availabilityStatus === 'temporarily_unavailable'

  return {
    id: product.id,
    nombre: product.name,
    descripcion: product.description,
    condicion: product.condition || 'buen estado',
    categoria: product.category?.name || 'Otros',
    categoriaSlug: product.category?.slug,
    vendedor: product.seller?.display_name || 'EcoBazar',
    vendedorTipo: product.bazaar ? 'Bazar' : 'Vendedor',
    seller: product.seller,
    bazaar: product.bazaar,
    talla: firstAvailableVariant?.size_name || variants[0]?.size_name || 'N/A',
    precio: price,
    precioOriginal: Math.round(price * 1.25),
    descuento: price > 0 ? 20 : 0,
    precioCentavos: product.price_cents,
    moneda: product.currency || 'MXN',
    imagen: product.images?.[0]?.url || FALLBACK_IMAGE,
    imagenes: product.images || [],
    variants,
    varianteDisponible: firstAvailableVariant,
    totalStock,
    availabilityStatus,
    isWishlisted: product.is_wishlisted === true,
    wishlistedAt: product.wishlisted_at || null,
    agotadoTemporalmente: temporarilyUnavailable,
    tipo: temporarilyUnavailable
      ? 'Sold out'
      : availabilityStatus === 'available'
        ? 'Disponible'
        : null,
    entrega: 'Entrega presencial',
    direccion: product.bazaar?.name || 'Durango, Dgo.',
  }
}

export function centsToPesos(value) {
  return Math.round(Number(value || 0) / 100)
}
