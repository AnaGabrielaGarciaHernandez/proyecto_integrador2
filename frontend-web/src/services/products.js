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
  return {
    products: (data.products || []).map(mapProduct),
    pagination: data.pagination,
  }
}

export async function getProduct(id) {
  const data = await get(`/products/${id}`)
  return mapProduct(data.product)
}

export function mapProduct(product) {
  const variants = product.variants || []
  const firstAvailableVariant = variants.find((variant) => variant.stock > 0) || variants[0] || null
  const price = centsToPesos(product.price_cents)

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
    talla: firstAvailableVariant?.size_name || 'N/A',
    precio: price,
    precioOriginal: Math.round(price * 1.25),
    descuento: price > 0 ? 20 : 0,
    precioCentavos: product.price_cents,
    moneda: product.currency || 'MXN',
    imagen: product.images?.[0]?.url || FALLBACK_IMAGE,
    imagenes: product.images || [],
    variants,
    varianteDisponible: firstAvailableVariant,
    totalStock: product.total_stock || 0,
    tipo: product.total_stock > 0 ? 'Disponible' : 'Sin stock',
    entrega: 'Entrega presencial',
    direccion: product.bazaar?.name || 'Durango, Dgo.',
  }
}

export function centsToPesos(value) {
  return Math.round(Number(value || 0) / 100)
}
