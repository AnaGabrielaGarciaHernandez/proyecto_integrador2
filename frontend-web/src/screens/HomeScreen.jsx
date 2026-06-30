import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, Flame, RefreshCw, ChevronRight } from 'lucide-react'
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

function Carrusel({ productos }) {
  const ref = useRef(null)
  const [dotActivo, setDotActivo] = useState(0)
  const totalDots = Math.ceil(productos.length / 2)

  function irADot(i) {
    const cardWidth = 236
    ref.current.scrollLeft = i * cardWidth * 2
    setDotActivo(i)
  }

  return (
    <div className="carrusel-wrapper">
      <div className="carrusel" ref={ref}>
        {productos.map(p => (
          <ProductCard key={p.id} producto={p} />
        ))}
      </div>
      <div className="carrusel-dots">
        {Array.from({ length: totalDots }).map((_, i) => (
          <button
            key={i}
            className={`carrusel-dot ${i === dotActivo ? 'activo' : ''}`}
            onClick={() => irADot(i)}
          />
        ))}
      </div>
    </div>
  )
}

export default function HomeScreen() {
  return (
    <div>
      <Hero />

      <div className="home-seccion">
        <div className="seccion-header">
          <h2 className="seccion-titulo">
            <Sparkles size={20} /> Recién llegados
          </h2>
          <Link to="/explorar" className="seccion-ver-todos">
            Ver todos <ChevronRight size={14} />
          </Link>
        </div>
        <Carrusel productos={productosRecientes} />
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
        <Carrusel productos={productosVistos} />
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