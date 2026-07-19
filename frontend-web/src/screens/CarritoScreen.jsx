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
  reconciliarCarrito,
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
  const [ajustes, setAjustes] = useState([]);
  const [itemProcesando, setItemProcesando] = useState(null);
  const [cargaFallida, setCargaFallida] = useState(false);
  const [reintento, setReintento] = useState(0);

  useEffect(() => {
    const handlePageShow = (event) => {
      if (!event.persisted) return;
      setProcesando(false);
      setItemProcesando(null);
      setCargando(true);
      setReintento((revision) => revision + 1);
    };

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  useEffect(() => {
    let mounted = true;

    if (authLoading || !user) return () => { mounted = false; };

    const cargarInicial = async () => {
      try {
        setCargando(true);
        setError("");
        setCargaFallida(false);
        const cart = await reconciliarCarrito();
        if (!mounted) return;
        aplicarCarrito(cart, true);
      } catch (err) {
        if (!mounted) return;
        setError(err.message || "No se pudo verificar el stock del carrito.");
        setCargaFallida(true);
      } finally {
        if (mounted) setCargando(false);
      }
    };

    cargarInicial();

    return () => {
      mounted = false;
    };
  }, [authLoading, user, reintento]);

  function aplicarCarrito(cart, incluirAjustes = false) {
    setItems(cart.items);
    setSubtotalCentavos(cart.subtotalCentavos);
    setTotalCentavos(cart.totalCentavos);
    if (incluirAjustes) setAjustes(cart.ajustes);
  }

  async function handleEliminar(id) {
    if (itemProcesando || procesando) return;
    try {
      setItemProcesando(id);
      setError("");
      setAjustes([]);
      const cart = await eliminarDelCarrito(id);
      aplicarCarrito(cart, true);
    } catch (err) {
      setError(err.message || "No se pudo eliminar el producto.");
    } finally {
      setItemProcesando(null);
    }
  }

  async function handleCantidad(item, delta) {
    if (itemProcesando || procesando) return;
    const nextQuantity = Math.max(1, item.cantidad + delta);
    if (nextQuantity === item.cantidad) return;

    try {
      setItemProcesando(item.id);
      setError("");
      setAjustes([]);
      const cart = await cambiarCantidad(item.id, nextQuantity);
      aplicarCarrito(cart, true);
    } catch (err) {
      setError(err.message || "No se pudo actualizar la cantidad.");
      if (
        err.details?.code === "STOCK_UNAVAILABLE"
        || err.details?.code === "CART_ITEM_NOT_FOUND"
      ) {
        try {
          aplicarCarrito(await reconciliarCarrito(), true);
        } catch {
          // Keep the original stock error visible.
        }
      }
    } finally {
      setItemProcesando(null);
    }
  }

  async function handlePagar() {
    if (procesando || itemProcesando) return;
    try {
      setProcesando(true);
      setError("");
      const checkout = await crearCheckout();
      window.location.assign(checkout.url);
    } catch (err) {
      const messages = {
        CART_EMPTY: "Tu carrito está vacío.",
        STOCK_UNAVAILABLE: "Cambió el stock disponible. Revisa las cantidades de tu carrito.",
        MIXED_CURRENCY: "Los productos del carrito usan monedas distintas.",
        CHECKOUT_CART_CHANGED: "Tu carrito cambió mientras preparábamos el pago. Inténtalo nuevamente.",
        CHECKOUT_IN_PROGRESS: "Ya hay un pago en proceso para esta cuenta.",
        STRIPE_UNAVAILABLE: "Los pagos no están disponibles por el momento.",
      };
      if (err.details?.code === "STOCK_UNAVAILABLE") {
        try {
          aplicarCarrito(await reconciliarCarrito(), true);
        } catch {
          // Keep the checkout stock error visible.
        }
      }
      setError(messages[err.details?.code] || err.message || "No se pudo iniciar el pago.");
      setProcesando(false);
    }
  }

  const formatMoney = (cents) => new Intl.NumberFormat("es-MX", {
    style: "currency", currency: "MXN",
  }).format(cents / 100);
  const controlesBloqueados = procesando || Boolean(itemProcesando);

  return (
    <div>
      <div className="carrito-hero">
        <h1>Mi carrito</h1>

        <p className="carrito-hero-sub">
          {!authLoading && !user
            ? "Inicia sesión"
            : cargando
              ? "Verificando disponibilidad"
              : cargaFallida
                ? "No disponible"
                : items.length === 0
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
      {error && !cargaFallida && <div className="login-error" role="alert">{error}</div>}
      {!cargando && !cargaFallida && ajustes.length > 0 && (
        <div className="carrito-ajustes" role="status">
          <strong>Actualizamos tu carrito</strong>
          {ajustes.map((ajuste, index) => (
            <span key={`${ajuste.itemId || ajuste.nombre}-${index}`}>
              {formatAdjustment(ajuste)}
            </span>
          ))}
        </div>
      )}

      {cargando ? (
        <div className="carrito-vacio">
          <p>Cargando carrito...</p>
        </div>
      ) : cargaFallida ? (
        <div className="carrito-vacio">
          <p role="alert">{error || "No pudimos cargar tu carrito."}</p>
          <button
            type="button"
            className="carrito-vacio-btn"
            onClick={() => setReintento((revision) => revision + 1)}
          >
            Reintentar
          </button>
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
                      disabled={item.cantidad <= 1 || controlesBloqueados}
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
                      disabled={item.cantidad >= item.stock || controlesBloqueados}
                      aria-label={`Aumentar cantidad de ${item.nombre}`}
                    >
                      <Plus size={12} />
                    </button>

                    <button
                      className="carrito-btn-eliminar"
                      onClick={() => handleEliminar(item.id)}
                      disabled={controlesBloqueados}
                      aria-label={`Eliminar ${item.nombre} del carrito`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {item.stock > 0 && item.cantidad >= item.stock && (
                    <span className="carrito-stock-maximo">
                      Máximo disponible: {item.stock}
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

          <button
            className="carrito-btn-pagar"
            onClick={handlePagar}
            disabled={controlesBloqueados}
            aria-busy={procesando}
          >
            {procesando ? "Preparando pago..." : "Ir a pagar"}
            <ArrowRight size={16} />
          </button>
        </div>
      )}
      </>}
    </div>
  );
}

function formatAdjustment(ajuste) {
  if (ajuste.codigo === "CART_ITEM_REMOVED") {
    return `Quitamos ${ajuste.nombre} porque ya no está disponible.`;
  }
  return `Reducimos ${ajuste.nombre} de ${ajuste.cantidadAnterior} a ${ajuste.cantidadNueva} unidades por disponibilidad.`;
}
