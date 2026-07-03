import { Heart, ShoppingCart } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { agregarAlCarrito } from '../services/carrito'
import '../styles/ProductCard.css'

export default function ProductCard({ producto, onAgregar }) {
  const navigate = useNavigate()

  const {
    id,
    nombre,
    categoria,
    precio,
    precioOriginal,
    imagen,
    vendedor,
    talla,
    condicion,
    tipo
  } = producto

  const descuento = Math.round(
    ((precioOriginal - precio) / precioOriginal) * 100
  )

  function irAlProducto() {
    navigate(`/producto/${id}`)
  }

  function handleAgregar(e) {
    e.preventDefault()
    e.stopPropagation()

    agregarAlCarrito(producto)

    if (onAgregar) {
      onAgregar(nombre)
    }
  }

  return (
    <div
      className="product-card"
      onClick={irAlProducto}
    >
      <div className="card-imagen">
        <img src={imagen} alt={nombre} />

        <div className="card-badges-top">
          {tipo && (
            <span className={`badge-tipo badge-tipo--${tipo.toLowerCase()}`}>
              {tipo}
            </span>
          )}

          <span className="badge-descuento">
            -{descuento}%
          </span>
        </div>

        <button
          className="card-favorito"
          onClick={(e) => e.stopPropagation()}
        >
          <Heart size={16} />
        </button>

        <div className="card-condicion">
          <span
            className={`badge-condicion badge-condicion--${condicion
              .toLowerCase()
              .replace(' ', '-')}`}
          >
            {condicion}
          </span>
        </div>
      </div>

      <div className="card-info">

        <span className="card-categoria">
          {categoria}
        </span>

        <h3 className="card-nombre">
          {nombre}
        </h3>

        <div className="card-footer">

          <div className="card-vendedor">
            <span className="vendedor-avatar">👤</span>

            <span className="vendedor-nombre">
              {vendedor}
            </span>

            <span className="vendedor-talla">
              {talla}
            </span>
          </div>

          <div className="card-precio-carrito">

            <div className="card-precios">
              <span className="precio-actual">
                ${precio}
              </span>

              <span className="precio-original">
                ${precioOriginal}
              </span>
            </div>

            <button
              type="button"
              className="btn-carrito"
              onClick={handleAgregar}
            >
              <ShoppingCart size={15} />
            </button>

          </div>

        </div>

      </div>

    </div>
  )
}