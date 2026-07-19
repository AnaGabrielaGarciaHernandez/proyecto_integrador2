import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Sparkles,
  Flame,
  RefreshCw,
  ChevronRight,
  ShoppingCart,
  X,
} from 'lucide-react'

import ProductCard from '../components/ProductCard'
import { useAuth } from '../context/useAuth'
import { getProducts } from '../services/products'

import '../styles/HomeScreen.css'

const heroSlides = [
  {
    id: 1,
    imagen:
      'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200',
  },
  {
    id: 2,
    imagen:
      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200',
  },
  {
    id: 3,
    imagen:
      'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=1200',
  },
]

function Hero() {
  const [slideActual, setSlideActual] = useState(0)

  useEffect(() => {
    const intervalo = setInterval(() => {
      setSlideActual((prev) => (prev + 1) % heroSlides.length)
    }, 4000)

    return () => clearInterval(intervalo)
  }, [])

  return (
    <div className="hero">
      {heroSlides.map((slide, i) => (
        <div
          key={slide.id}
          className={`hero-slide ${i === slideActual ? 'activo' : ''}`}
          style={{ backgroundImage: `url(${slide.imagen})` }}
        />
      ))}

      <div className="hero-overlay" />

      <div className="hero-contenido">
        <div className="hero-etiqueta">
          <RefreshCw size={12} />
          MODA CIRCULAR · DURANGO
        </div>

        <h1 className="hero-titulo">
          Ropa que
          <br />
          <span>importa.</span>
        </h1>

        <p className="hero-subtitulo">
          Compra y vende ropa de segunda mano
        </p>
      </div>
    </div>
  )
}

function Carrusel({ productos, onAgregar, onError }) {
  return (
    <div className="carrusel-wrapper">
      <div className="carrusel">
        {productos.map((p) => (
          <ProductCard
            key={p.id}
            producto={p}
            onAgregar={onAgregar}
            onError={onError}
          />
        ))}
      </div>
    </div>
  )
}

export default function HomeScreen() {
  const { user, loading: authLoading, updatePreferences } = useAuth()
  const [toast, setToast] = useState(null)
  const [productos, setProductos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [bannerSavingAccountId, setBannerSavingAccountId] = useState(null)
  const [bannerError, setBannerError] = useState(null)

  useEffect(() => {
    let mounted = true

    getProducts({ limit: 12 })
      .then(({ products }) => {
        if (mounted) setProductos(products)
      })
      .catch((err) => {
        if (mounted)
          setError(err.message || 'No se pudieron cargar productos.')
      })
      .finally(() => {
        if (mounted) setCargando(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  function handleAgregar(producto) {
    setError('')
    setToast(producto.nombre)

    setTimeout(() => {
      setToast(null)
    }, 2500)
  }

  async function handleAgregarError(err) {
    const productUnavailable = err.details?.code === 'PRODUCT_UNAVAILABLE' || err.status === 404
    setError(
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
      const { products } = await getProducts({ limit: 12 })
      setProductos(products)
    } catch {
      // Keep the actionable stock message already shown.
    }
  }

  async function handleOcultarBanner() {
    const accountId = user?.id
    if (!accountId) return

    try {
      setBannerSavingAccountId(accountId)
      setBannerError(null)
      await updatePreferences({ show_home_sell_banner: false })
    } catch (err) {
      setBannerError({
        accountId,
        message: err.message || 'No se pudo ocultar el aviso. Inténtalo de nuevo.',
      })
    } finally {
      setBannerSavingAccountId((savingAccountId) => (
        savingAccountId === accountId ? null : savingAccountId
      ))
    }
  }

  const productosRecientes = productos.slice(0, 6)
  const productosVistos = productos.slice(6, 12)
  const mostrarBannerVender = (
    !authLoading
    && (!user || user.preferences?.show_home_sell_banner === true)
  )
  const currentBannerError = bannerError && bannerError.accountId === user?.id
    ? bannerError.message
    : ''
  const bannerSaving = bannerSavingAccountId === user?.id

  return (
    <div>
      <Hero />

      {toast && (
        <div className="toast-carrito" role="status" aria-live="polite" aria-atomic="true">
          <ShoppingCart size={16} />
          Agregado: {toast}
        </div>
      )}

      {error && <div className="login-error" role="alert">{error}</div>}

      {cargando && (
        <div style={{ padding: '24px' }}>
          Cargando productos...
        </div>
      )}

      <div className="home-seccion">
        <div className="seccion-header">
          <h2 className="seccion-titulo">
            <Sparkles size={20} />
            Recién llegados
          </h2>

          <Link
            to="/explorar"
            className="seccion-ver-todos"
          >
            Ver todos
            <ChevronRight size={14} />
          </Link>
        </div>

        <Carrusel
          productos={productosRecientes}
          onAgregar={handleAgregar}
          onError={handleAgregarError}
        />
      </div>

      <div className="home-seccion">
        <div className="seccion-header">
          <h2 className="seccion-titulo">
            <Flame size={20} />
            Más vistos
          </h2>

          <Link
            to="/explorar"
            className="seccion-ver-todos"
          >
            Ver todos
            <ChevronRight size={14} />
          </Link>
        </div>

        <Carrusel
          productos={productosVistos}
          onAgregar={handleAgregar}
          onError={handleAgregarError}
        />
      </div>

      <Link
        to="/explorar"
        className="banner-categoria"
      >
        <p>Explorar por categoría</p>
        <ChevronRight size={20} />
      </Link>

      {mostrarBannerVender && (
        <div className={`banner-vender ${user ? 'banner-vender--cerrable' : ''}`}>
          {user && (
            <button
              type="button"
              className="banner-vender-cerrar"
              aria-label="No volver a mostrar este aviso"
              aria-busy={bannerSaving}
              disabled={bannerSaving}
              onClick={handleOcultarBanner}
            >
              <X size={20} aria-hidden="true" />
            </button>
          )}

          <RefreshCw
            size={28}
            color="#52b788"
            className="banner-vender-icono"
          />

          <div className="banner-vender-texto">
            <h3>
              ¿Quieres darle una segunda oportunidad a tu ropa que no usas?
            </h3>

            <p>Publica gratis en EcoBazar</p>
            {currentBannerError && (
              <p className="banner-vender-error" role="alert">
                {currentBannerError}
              </p>
            )}
          </div>

          <Link
            to="/vender"
            className="banner-vender-btn"
          >
            Publicar
          </Link>
        </div>
      )}
    </div>
  )
}
