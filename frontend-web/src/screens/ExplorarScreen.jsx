import { useEffect, useMemo, useState } from "react";
import { Search, ShoppingCart } from "lucide-react";
import ProductCard from "../components/ProductCard";
import { useAuth } from "../context/useAuth";
import { getProducts } from "../services/products";
import "../styles/ExplorarScreen.css";

const categorias = [
  { nombre: "Todo" },
  { nombre: "Sudaderas" },
  { nombre: "Chaquetas" },
  { nombre: "Pantalones" },
  { nombre: "Camisetas" },
  { nombre: "Vestidos" },
  { nombre: "Calzado" },
  { nombre: "Accesorios" },
];

export default function ExplorarScreen() {
  const { user, loading: authLoading } = useAuth();
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [toast, setToast] = useState(null);

  const [busqueda, setBusqueda] = useState("");
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState("Todo");

  useEffect(() => {
    if (authLoading) return undefined;
    let mounted = true;

    getProducts({ limit: 48 })
      .then(({ products }) => {
        if (mounted) setProductos(products);
      })
      .catch((err) => {
        if (mounted)
          setError(err.message || "No se pudieron cargar los productos.");
      })
      .finally(() => {
        if (mounted) setCargando(false);
      });

    return () => {
      mounted = false;
    };
  }, [authLoading, user?.id]);

  function handleAgregar(producto) {
    setActionError("");
    setToast(producto.nombre);

    setTimeout(() => {
      setToast(null);
    }, 2500);
  }

  async function handleAgregarError(err) {
    const productUnavailable = err.details?.code === "PRODUCT_UNAVAILABLE" || err.status === 404;
    setActionError(
      productUnavailable
        ? "Este producto ya no está disponible."
        : err.message || "No se pudo agregar al carrito.",
    );
    if (
      err.details?.code !== "STOCK_UNAVAILABLE"
      && err.details?.code !== "PRODUCT_UNAVAILABLE"
      && err.status !== 404
    ) return;

    try {
      const { products } = await getProducts({ limit: 48 });
      setProductos(products);
    } catch {
      // Keep the stock error visible if refresh also fails.
    }
  }

  const productosFiltrados = useMemo(() => {
    return productos.filter((producto) => {
      const coincideNombre =
        producto.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ??
        false;

      const coincideCategoria =
        categoriaSeleccionada === "Todo" ||
        producto.categoria?.toLowerCase() ===
          categoriaSeleccionada.toLowerCase();

      return coincideNombre && coincideCategoria;
    });
  }, [productos, busqueda, categoriaSeleccionada]);

  return (
    <div className="explorar-container">
      {toast && (
        <div className="toast-carrito" role="status" aria-live="polite" aria-atomic="true">
          <ShoppingCart size={16} /> Agregado: {toast}
        </div>
      )}

      {/* Header oscuro */}
      <div className="explorar-header">
        <h1>Explorar</h1>
        <p className="explorar-header-sub">
          {productosFiltrados.length} prendas
        </p>
        <div className="explorar-search">
          <Search size={18} />
          <input
            type="text"
            placeholder="Buscar prendas..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
      </div>

      {/* Categorías */}
      <div className="explorar-categorias">
        {categorias.map((categoria) => (
          <button
            key={categoria.nombre}
            className={
              categoriaSeleccionada === categoria.nombre
                ? "categoria active"
                : "categoria"
            }
            onClick={() => setCategoriaSeleccionada(categoria.nombre)}
          >
            <span>{categoria.nombre}</span>
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="explorar-body">
        {/* Subtítulo categoría */}
        {!cargando && !error && (
          <div className="explorar-categoria-titulo">
            {categoriaSeleccionada === "Todo"
              ? "Todas las prendas"
              : categoriaSeleccionada}
            <span className="explorar-categoria-count">
              · {productosFiltrados.length} prendas
            </span>
          </div>
        )}

        {cargando && (
          <div className="explorar-loading">Cargando productos...</div>
        )}
        {error && <div className="login-error" role="alert">{error}</div>}
        {actionError && (
          <div className="login-error" role="alert">{actionError}</div>
        )}

        {!cargando && !error && productosFiltrados.length === 0 && (
          <div className="explorar-vacio">No se encontraron productos.</div>
        )}

        {!cargando && !error && (
          <div className="explorar-grid">
            {productosFiltrados.map((producto) => (
              <ProductCard
                key={producto.id}
                producto={producto}
                onAgregar={handleAgregar}
                onError={handleAgregarError}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
