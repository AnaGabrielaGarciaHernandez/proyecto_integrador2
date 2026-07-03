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

export default function CarritoScreen() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const actualizar = () => {
      setItems(getCarrito());
    };

    actualizar();

    window.addEventListener("carritoActualizado", actualizar);

    return () => {
      window.removeEventListener("carritoActualizado", actualizar);
    };
  }, []);

  function handleEliminar(id) {
    eliminarDelCarrito(id);
  }

  function handleCantidad(id, delta) {
    cambiarCantidad(id, delta);
  }

  const subtotal = items.reduce(
    (sum, item) => sum + item.precio * item.cantidad,
    0
  );

  const total = subtotal + (items.length ? ENVIO : 0);

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

      {items.length === 0 ? (
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

                <div className="carrito-item-controles">
                  <button
                    className="carrito-btn-cantidad"
                    onClick={() => handleCantidad(item.id, -1)}
                  >
                    <Minus size={12} />
                  </button>

                  <span className="carrito-cantidad">
                    {item.cantidad}
                  </span>

                  <button
                    className="carrito-btn-cantidad"
                    onClick={() => handleCantidad(item.id, 1)}
                  >
                    <Plus size={12} />
                  </button>

                  <button
                    className="carrito-btn-eliminar"
                    onClick={() => handleEliminar(item.id)}
                  >
                    <Trash2 size={13} />
                  </button>
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