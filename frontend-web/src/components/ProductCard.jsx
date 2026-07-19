import { useState } from "react";
import { ShoppingCart } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { agregarAlCarrito } from "../services/carrito";
import { useAuth } from "../context/useAuth";
import "../styles/ProductCard.css";

export default function ProductCard({ producto, onAgregar, onError }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [agregando, setAgregando] = useState(false);

  const {
    id,
    nombre,
    categoria,
    precio,
    imagen,
    vendedor,
    talla,
    condicion,
    tipo,
    varianteDisponible,
    totalStock,
    availabilityStatus,
  } = producto;
  const soldOut = availabilityStatus === "temporarily_unavailable" || totalStock <= 0;

  async function handleAgregar(e) {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      navigate("/login");
      return;
    }

    if (!varianteDisponible?.id || soldOut || agregando) return;

    try {
      setAgregando(true);
      await agregarAlCarrito(varianteDisponible.id);
      onAgregar?.(producto);
    } catch (error) {
      onError?.(error, producto);
    } finally {
      setAgregando(false);
    }
  }

  return (
    <div
      className={`product-card ${soldOut ? "product-card--sold-out" : ""}`}
    >
      <Link
        to={`/producto/${id}`}
        className="product-card-detail-link"
        aria-label={`Ver detalles de ${nombre}`}
      />

      <div className="card-imagen">
        <img src={imagen} alt={nombre} />

        <div className="card-badges-top">
          {tipo && (
            <span
              className={`badge-tipo ${
                soldOut ? "badge-tipo--sold-out" : "badge-tipo--available"
              }`}
            >
              {tipo}
            </span>
          )}
        </div>

        <div className="card-condicion">
          <span
            className={`badge-condicion badge-condicion--${condicion
              .toLowerCase()
              .replace(" ", "-")}`}
          >
            {condicion}
          </span>
        </div>
      </div>

      <div className="card-info">
        <span className="card-categoria">{categoria}</span>

        <h3 className="card-nombre">{nombre}</h3>

        <div className="card-footer">
          <div className="card-vendedor">
            <span className="vendedor-avatar">👤</span>

            <span className="vendedor-nombre">{vendedor}</span>

            <span className="vendedor-talla">{talla}</span>
          </div>

          <div className="card-precio-carrito">
            <div className="card-precios">
              <span className="precio-actual">${precio}</span>
            </div>

            <button
              type="button"
              className="btn-carrito"
              onClick={handleAgregar}
              disabled={!varianteDisponible?.id || soldOut || agregando}
              aria-label={soldOut ? `${nombre} agotado temporalmente` : `Agregar ${nombre} al carrito`}
              aria-busy={agregando}
              title={soldOut ? "Agotado temporalmente" : "Agregar al carrito"}
            >
              <ShoppingCart size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
