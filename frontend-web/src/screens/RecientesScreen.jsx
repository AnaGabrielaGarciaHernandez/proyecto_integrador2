import { useEffect, useState } from 'react'
import { ShoppingCart } from 'lucide-react'
import { getProducts } from '../services/products'
import ProductCard from '../components/ProductCard'
import '../styles/RecientesScreen.css'

export default function RecientesScreen() {
  const [productos, setProductos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [toast, setToast] = useState(null)

  useEffect(() => {
    let mounted = true

    getProducts({ limit: 24 })
      .then(({ products }) => {
        if (mounted) setProductos(products)
      })
      .catch((err) => {
        if (mounted) setError(err.message || 'No se pudieron cargar los productos.')
      })
      .finally(() => {
        if (mounted) setCargando(false)
      })

    return () => { mounted = false }
  }, [])

  function handleAgregar(producto) {
    setActionError('')
    setToast(producto.nombre)
    setTimeout(() => setToast(null), 2500)
  }

  async function handleAgregarError(err) {
    const productUnavailable = err.details?.code === 'PRODUCT_UNAVAILABLE' || err.status === 404
    setActionError(
      productUnavailable
        ? 'Este producto ya no está disponible.'
        : err.message || 'No se pudo agregar al carrito.',
    )
    if (
      err.details?.code !== 'STOCK_UNAVAILABLE'
      && err.details?.code !== 'PRODUCT_UNAVAILABLE'
      && err.status !== 404
    ) return

    try {
      const { products } = await getProducts({ limit: 24 })
      setProductos(products)
    } catch {
      // Keep the stock error visible if refresh also fails.
    }
  }

  return (
    <div className="recientes-container">
      {toast && (
        <div className="toast-carrito" role="status" aria-live="polite" aria-atomic="true">
          <ShoppingCart size={16} /> Agregado: {toast}
        </div>
      )}

      <div className="recientes-hero">
        <h2>Agregados recientes</h2>
        <p>Las últimas prendas añadidas al bazar</p>
      </div>

      <div className="recientes-body">
        {cargando && <div className="recientes-loading">Cargando productos...</div>}
        {error && <div className="login-error" role="alert">{error}</div>}
        {actionError && <div className="login-error" role="alert">{actionError}</div>}

        {!cargando && !error && (
          <div className="recientes-grid">
            {productos.map((p) => (
              <div key={p.id} className="recientes-item">
                <ProductCard
                  producto={p}
                  onAgregar={handleAgregar}
                  onError={handleAgregarError}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
