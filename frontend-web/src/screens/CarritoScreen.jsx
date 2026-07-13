import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ShoppingBag,
  Minus,
  Plus,
  Trash2,
  ArrowRight,
} from "lucide-react";

import {
  getCarrito,
  eliminarDelCarrito,
  cambiarCantidad,
} from "../services/carrito";

import "../styles/CarritoScreen.css";

const ENVIO = 49;
const ENVIO_CENTAVOS = ENVIO * 100;

export default function CarritoScreen() {
  const [items, setItems] = useState([]);
  const [subtotalCentavos, setSubtotalCentavos] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    const actualizar = async () => {
      try {
        setError("");
        const cart = await getCarrito();
        if (!mounted) return;
        setItems(cart.items);
        setSubtotalCentavos(cart.subtotalCentavos);
      } catch (err) {
        if (!mounted) return;
        setError(err.message || "No se pudo cargar el carrito.");
        setItems([]);
        setSubtotalCentavos(0);
      } finally {
        if (mounted) setCargando(false);
      }
    };

    actualizar();

    window.addEventListener("carritoActualizado", actualizar);

    return () => {
      mounted = false;
      window.removeEventListener("carritoActualizado", actualizar);
    };
  }, []);

  async function handleEliminar(id) {
    try {
      const cart = await eliminarDelCarrito(id);
      setItems(cart.items);
      setSubtotalCentavos(cart.subtotalCentavos);
    } catch (err) {
      setError(err.message || "No se pudo eliminar el producto.");
    }
  }

  async function handleCantidad(item, delta) {
    const nextQuantity = Math.max(1, item.cantidad + delta);
    try {
      const cart = await cambiarCantidad(item.id, nextQuantity);
      setItems(cart.items);
      setSubtotalCentavos(cart.subtotalCentavos);
    } catch (err) {
      setError(err.message || "No se pudo actualizar la cantidad.");
    }
  }

  const subtotal = Math.round(subtotalCentavos / 100);
  const total = Math.round((subtotalCentavos + (items.length ? ENVIO_CENTAVOS : 0)) / 100);

  return (
    <div>
      <div className="carrito-hero">
        <h1>Mi carrito</h1>

        <p className="carrito-hero-sub">
          {items.length === 0
            ? "Vacío"
            : `${items.length} prenda${items.length > 1 ? "s" : ""}`}
        </p>
      </div>

      {error && <div className="login-error">{error}</div>}

      {cargando ? (
        <div className="carrito-vacio">
          <p>Cargando carrito...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="carrito-vacio">
          <ShoppingBag size={56} strokeWidth={1} />

          <p>Tu carrito está vacío</p>

          <Link to="/explorar" className="carrito-vacio-btn">
            Explorar prendas
          </Link>
        </div>
      ) : (
        <div className="carrito-body">
          <div className="carrito-items">
            {items.map(item => (
              <div className="carrito-item" key={item.id}>
                <img
                  src={item.imagen}
                  alt={item.nombre}
                  className="carrito-item-img"
                />

                <div className="carrito-item-info">
                  <p className="carrito-item-nombre">{item.nombre}</p>

                  <div className="carrito-item-meta">
                    <span className="carrito-item-vendedor">
                      {item.vendedor}
                    </span>

                    <span className="carrito-item-talla">
                      {item.talla}
                    </span>
                  </div>

                  <p className="carrito-item-precio">
                    ${item.precio}
                  </p>
                </div>

                <div className="carrito-item-acciones">
                  <div className="carrito-item-controles">
                    <button
                      className="carrito-btn-cantidad"
                      onClick={() => handleCantidad(item, -1)}
                      aria-label={`Disminuir cantidad de ${item.nombre}`}
                    >
                      <Minus size={12} />
                    </button>

                    <span className="carrito-cantidad">
                      {item.cantidad}
                    </span>

                    <button
                      className="carrito-btn-cantidad"
                      onClick={() => handleCantidad(item, 1)}
                      disabled={item.cantidad >= item.stock}
                      aria-label={`Aumentar cantidad de ${item.nombre}`}
                    >
                      <Plus size={12} />
                    </button>

                    <button
                      className="carrito-btn-eliminar"
                      onClick={() => handleEliminar(item.id)}
                      aria-label={`Eliminar ${item.nombre} del carrito`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {item.cantidad >= item.stock && (
                    <span className="carrito-stock-maximo">
                      Stock máximo alcanzado
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="carrito-resumen">
            <div className="carrito-resumen-fila">
              <span>Subtotal</span>
              <span>${subtotal}</span>
            </div>

            <div className="carrito-resumen-fila">
              <span>Envío</span>
              <span>${ENVIO}</span>
            </div>

            <div className="carrito-resumen-total">
              <span>Total</span>
              <span>${total}</span>
            </div>
          </div>

          <button className="carrito-btn-pagar">
            Ir a pagar
            <ArrowRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
