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
import { crearCheckout } from "../services/checkout";
import { useAuth } from "../context/useAuth";

import "../styles/CarritoScreen.css";

export default function CarritoScreen() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState([]);
  const [subtotalCentavos, setSubtotalCentavos] = useState(0);
  const [totalCentavos, setTotalCentavos] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    if (authLoading || !user) return () => { mounted = false; };

    const actualizar = async () => {
      try {
        setError("");
        const cart = await getCarrito();
        if (!mounted) return;
        setItems(cart.items);
        setSubtotalCentavos(cart.subtotalCentavos);
        setTotalCentavos(cart.totalCentavos);
      } catch (err) {
        if (!mounted) return;
        setError(err.message || "No se pudo cargar el carrito.");
        setItems([]);
        setSubtotalCentavos(0);
        setTotalCentavos(0);
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
  }, [authLoading, user]);

  async function handleEliminar(id) {
    try {
      const cart = await eliminarDelCarrito(id);
      setItems(cart.items);
      setSubtotalCentavos(cart.subtotalCentavos);
      setTotalCentavos(cart.totalCentavos);
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
      setTotalCentavos(cart.totalCentavos);
    } catch (err) {
      setError(err.message || "No se pudo actualizar la cantidad.");
    }
  }

  async function handlePagar() {
    if (procesando) return;
    try {
      setProcesando(true);
      setError("");
      const checkout = await crearCheckout();
      window.location.assign(checkout.url);
    } catch (err) {
      const messages = {
        CART_EMPTY: "Tu carrito está vacío.",
        STOCK_UNAVAILABLE: "Uno de los productos ya no tiene stock suficiente.",
        MIXED_CURRENCY: "Los productos del carrito usan monedas distintas.",
        CHECKOUT_IN_PROGRESS: "Ya hay un pago en proceso para esta cuenta.",
        STRIPE_UNAVAILABLE: "Los pagos no están disponibles por el momento.",
      };
      setError(messages[err.details?.code] || err.message || "No se pudo iniciar el pago.");
      setProcesando(false);
    }
  }

  const formatMoney = (cents) => new Intl.NumberFormat("es-MX", {
    style: "currency", currency: "MXN",
  }).format(cents / 100);

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

      {!authLoading && !user ? (
        <div className="carrito-vacio">
          <ShoppingBag size={56} strokeWidth={1} />
          <p>Inicia sesión para consultar y pagar tu carrito.</p>
          <Link to="/login" className="carrito-vacio-btn">Iniciar sesión</Link>
        </div>
      ) : <>
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
              <span>{formatMoney(subtotalCentavos)}</span>
            </div>

            <div className="carrito-resumen-fila">
              <span>Recolección presencial</span>
              <span>Gratis</span>
            </div>

            <div className="carrito-resumen-total">
              <span>Total</span>
              <span>{formatMoney(totalCentavos)}</span>
            </div>
          </div>

          <button className="carrito-btn-pagar" onClick={handlePagar} disabled={procesando}>
            {procesando ? "Preparando pago..." : "Ir a pagar"}
            <ArrowRight size={16} />
          </button>
        </div>
      )}
      </>}
    </div>
  );
}
