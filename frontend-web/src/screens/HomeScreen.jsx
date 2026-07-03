import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, Flame, RefreshCw, ChevronRight, ShoppingCart } from 'lucide-react'
import ProductCard from '../components/ProductCard'
import { productosRecientes, productosVistos } from '../data/productos'
import '../styles/HomeScreen.css'

const heroSlides = [
  { id: 1, imagen: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200' },
  { id: 2, imagen: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200' },
  { id: 3, imagen: 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=1200' },
]

function Hero() {
  const [slideActual, setSlideActual] = useState(0)

  useEffect(() => {
    const intervalo = setInterval(() => {
      setSlideActual(prev => (prev + 1) % heroSlides.length)
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
          <RefreshCw size={12} /> MODA CIRCULAR · DURANGO
        </div>
        <h1 className="hero-titulo">
          Ropa que<br />
          <span>importa.</span>
        </h1>
        <p className="hero-subtitulo">Compra y vende ropa de segunda mano</p>
      </div>
    </div>
  )
}

function Carrusel({ productos, onAgregar }) {
  const ref = useRef(null)

  return (
    <div className="carrusel-wrapper">
      <div className="carrusel" ref={ref}>
        {productos.map(p => (
          <ProductCard key={p.id} producto={p} onAgregar={onAgregar} />
        ))}
      </div>
    </div>
  )
}

export default function HomeScreen() {
  const [toast, setToast] = useState(null)

  function handleAgregar(nombre) {
    setToast(nombre)
    setTimeout(() => setToast(null), 2500)
  }

  return (
    <div>
      <Hero />

      {toast && (
        <div className="toast-carrito">
          <ShoppingCart size={16} /> Agregado: {toast}
        </div>
      )}

      {/* resto igual */}

      <div className="home-seccion">
        <div className="seccion-header">
          <h2 className="seccion-titulo">
            <Sparkles size={20} /> Recién llegados
          </h2>
          <Link to="/explorar" className="seccion-ver-todos">
            Ver todos <ChevronRight size={14} />
          </Link>
        </div>
        <Carrusel productos={productosRecientes} onAgregar={handleAgregar} />
      </div>

      <div className="home-seccion">
        <div className="seccion-header">
          <h2 className="seccion-titulo">
            <Flame size={20} /> Más vistos
          </h2>
          <Link to="/explorar" className="seccion-ver-todos">
            Ver todos <ChevronRight size={14} />
          </Link>
        </div>
        <Carrusel productos={productosVistos} onAgregar={handleAgregar} />
      </div>

      <Link to="/explorar" className="banner-categoria">
        <p>Explorar por categoría</p>
        <ChevronRight size={20} />
      </Link>

      <div className="banner-vender">
        <RefreshCw size={28} color="#52b788" className="banner-vender-icono" />
        <div className="banner-vender-texto">
          <h3>¿Quieres darle una segunda oportunidad a tu ropa que no usas?</h3>
          <p>Publica gratis en EcoBazar</p>
        </div>
        <Link to="/vender" className="banner-vender-btn">
          Publicar
        </Link>
      </div>
    </div>
  )
}