import { useEffect, useMemo, useState } from 'react'
import { Heart, RefreshCw } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import ProductCard from '../components/ProductCard'
import { useAuth } from '../context/useAuth'
import { useWishlist } from '../context/useWishlist'
import { getWishlist } from '../services/wishlist'
import '../styles/WishlistScreen.css'

const PAGE_SIZE = 24

export default function WishlistScreen() {
  const { user, loading: authLoading } = useAuth()
  const wishlist = useWishlist()
  const [products, setProducts] = useState([])
  const [serverTotal, setServerTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [cartMessage, setCartMessage] = useState('')

  useEffect(() => {
    if (authLoading || !user || user.role === 'admin') return
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setLoading(true)
      setError('')
      setProducts([])
    })

    getWishlist({ limit: PAGE_SIZE, offset: 0 })
      .then((page) => {
        if (!active) return
        setProducts(page.products)
        setServerTotal(page.total)
      })
      .catch((err) => {
        if (active) setError(err.message || 'No pudimos cargar tu lista.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [authLoading, retry, user])

  const visibleProducts = useMemo(
    () => products.filter((product) => wishlist.isWishlisted(product.id)),
    [products, wishlist],
  )

  async function loadMore() {
    try {
      setLoadingMore(true)
      setError('')
      const page = await getWishlist({
        limit: PAGE_SIZE,
        offset: visibleProducts.length,
      })
      setProducts((current) => {
        const ids = new Set(current.map((product) => product.id))
        return [...current, ...page.products.filter((product) => !ids.has(product.id))]
      })
      setServerTotal(page.total)
    } catch (err) {
      setError(err.message || 'No pudimos cargar más productos.')
    } finally {
      setLoadingMore(false)
    }
  }

  if (authLoading) return <div className="wishlist-state">Cargando tu cuenta...</div>
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'admin') return <Navigate to="/" replace />

  return (
    <div className="wishlist-page">
      <header className="wishlist-header">
        <Heart size={30} aria-hidden="true" />
        <div>
          <h1>Mi lista de deseos</h1>
          <p>{wishlist.count} {wishlist.count === 1 ? 'prenda guardada' : 'prendas guardadas'}</p>
        </div>
      </header>

      {cartMessage && <div className="login-error" role="status">{cartMessage}</div>}
      {error && (
        <div className="wishlist-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
            <RefreshCw size={15} /> Reintentar
          </button>
        </div>
      )}

      {loading && <div className="wishlist-state">Cargando tus prendas guardadas...</div>}

      {!loading && !error && wishlist.count === 0 && (
        <section className="wishlist-empty">
          <Heart size={48} aria-hidden="true" />
          <h2>Aún no guardas prendas</h2>
          <p>Usa el corazón para reunir aquí todo lo que te guste.</p>
          <Link to="/explorar">Explorar prendas</Link>
        </section>
      )}

      {!loading && visibleProducts.length > 0 && (
        <>
          <div className="wishlist-grid">
            {visibleProducts.map((product) => (
              <ProductCard
                key={product.id}
                producto={product}
                onAgregar={(item) => {
                  setCartMessage(`Agregado: ${item.nombre}`)
                  window.setTimeout(() => setCartMessage(''), 2400)
                }}
                onError={(err) => setError(err.message || 'No se pudo agregar al carrito.')}
              />
            ))}
          </div>
          {visibleProducts.length < serverTotal && (
            <button
              type="button"
              className="wishlist-load-more"
              onClick={loadMore}
              disabled={loadingMore}
              aria-busy={loadingMore}
            >
              {loadingMore ? 'Cargando...' : 'Cargar más'}
            </button>
          )}
        </>
      )}
    </div>
  )
}
