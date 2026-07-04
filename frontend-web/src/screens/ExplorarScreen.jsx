import { useEffect, useState } from 'react'
import { ShoppingCart } from 'lucide-react'
import ProductCard from '../components/ProductCard'
import { agregarAlCarrito } from '../services/carrito'
import { getProducts } from '../services/products'

export default function ExplorarScreen() {
  const [productos, setProductos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState(null)

  useEffect(() => {
    let mounted = true

    getProducts({ limit: 48 })
      .then(({ products }) => {
        if (mounted) setProductos(products)
      })
      .catch((err) => {
        if (mounted) setError(err.message || 'No se pudieron cargar productos.')
      })
      .finally(() => {
        if (mounted) setCargando(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  async function handleAgregar(producto) {
    try {
      setError('')
      await agregarAlCarrito(producto.varianteDisponible.id)
      setToast(producto.nombre)
      setTimeout(() => setToast(null), 2500)
    } catch (err) {
      setError(err.message || 'No se pudo agregar al carrito.')
    }
  }

  return (
    <div style={{ padding: '32px 20px' }}>
      {toast && (
        <div className="toast-carrito">
          <ShoppingCart size={16} /> Agregado: {toast}
        </div>
      )}

      <h1 style={{ marginBottom: '18px' }}>Explorar</h1>

      {cargando && <p>Cargando productos...</p>}
      {error && <div className="login-error">{error}</div>}

      {!cargando && !error && productos.length === 0 && (
        <p>No hay productos activos por ahora.</p>
      )}

      <div className="carrusel" style={{ flexWrap: 'wrap', overflow: 'visible' }}>
        {productos.map((producto) => (
          <ProductCard
            key={producto.id}
            producto={producto}
            onAgregar={handleAgregar}
          />
        ))}
      </div>
    </div>
  )
}
