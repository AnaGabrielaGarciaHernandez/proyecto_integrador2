import { Link } from 'react-router-dom'
import { Heart, ShoppingCart, User } from 'lucide-react'
import '../styles/ProductCard.css'

export default function ProductCard({ producto }) {
  const {
    id,
    imagen,
    tipo,
    descuento,
    condicion,
    categoria,
    nombre,
    vendedor,
    talla,
    precio,
    precioOriginal,
  } = producto

  return (
    <Link to={`/producto/${id}`} className="product-card">

      {/* Imagen */}
      <div className="card-imagen">
        <img src={imagen} alt={nombre} />

        {/* Badges superiores */}
        <div className="card-badges-top">
          {tipo && (
            <span className={`badge-tipo badge-tipo--${tipo.toLowerCase()}`}>
              {tipo}
            </span>
          )}
          {descuento && (
            <span className="badge-descuento">-{descuento}%</span>
          )}
        </div>

        {/* Favorito */}
        <button className="card-favorito" onClick={(e) => e.preventDefault()}>
          <Heart size={15} />
        </button>

        {/* Condición */}
        <div className="card-condicion">
          <span className={`badge-condicion badge-condicion--${condicion.toLowerCase().replace(' ', '-')}`}>
            ● {condicion}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="card-info">
        <p className="card-categoria">{categoria}</p>
        <p className="card-nombre">{nombre}</p>

        <div className="card-footer">
          <div className="card-vendedor">
            <User size={13} className="vendedor-avatar" />
            <span className="vendedor-nombre">{vendedor}</span>
            <span className="vendedor-talla">{talla}</span>
          </div>

          <div className="card-precio-carrito">
            <div className="card-precios">
              <span className="precio-actual">${precio}</span>
              {precioOriginal && (
                <span className="precio-original">${precioOriginal}</span>
              )}
            </div>
            <button className="btn-carrito" onClick={(e) => e.preventDefault()}>
              <ShoppingCart size={15} />
            </button>
          </div>
        </div>
      </div>

    </Link>
  )
}