import { useEffect, useState } from 'react'
import { getProducts } from '../services/products'
import ProductCard from '../components/ProductCard'
import '../styles/RecientesScreen.css'

export default function RecientesScreen() {
  const [productos, setProductos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

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

  return (
    <div className="recientes-container">
      <div className="recientes-hero">
        <h2>Agregados recientes</h2>
        <p>Las últimas prendas añadidas al bazar</p>
      </div>

      <div className="recientes-body">
        {cargando && <div className="recientes-loading">Cargando productos...</div>}
        {error && <div className="login-error">{error}</div>}

        {!cargando && !error && (
          <div className="recientes-grid">
            {productos.map((p) => (
              <div key={p.id} className="recientes-item">
                <ProductCard producto={p} onAgregar={() => {}} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
