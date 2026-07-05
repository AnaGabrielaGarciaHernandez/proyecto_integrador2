import { useEffect, useMemo, useState } from 'react'
import {
  Search,
  ShoppingCart,
  Grid2x2,
  Shirt,
  Badge,
  Footprints,
  Gem,
  Sparkles,
} from 'lucide-react'
import ProductCard from '../components/ProductCard'
import { agregarAlCarrito } from '../services/carrito'
import { getProducts } from '../services/products'
import '../styles/ExplorarScreen.css'

const categorias = [
  { nombre: 'Todo', icono: <Grid2x2 size={18} /> },
  { nombre: 'Sudaderas', icono: <Shirt size={18} /> },
  { nombre: 'Chaquetas', icono: <Badge size={18} /> },
  { nombre: 'Pantalones', icono: <Badge size={18} /> },
  { nombre: 'Camisas', icono: <Shirt size={18} /> },
  { nombre: 'Camisetas', icono: <Shirt size={18} /> },
  { nombre: 'Vestidos', icono: <Sparkles size={18} /> },
  { nombre: 'Calzado', icono: <Footprints size={18} /> },
  { nombre: 'Accesorios', icono: <Gem size={18} /> },
]

export default function ExplorarScreen() {
  const [productos, setProductos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState(null)

  const [busqueda, setBusqueda] = useState('')
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState('Todo')

  useEffect(() => {
    let mounted = true

    getProducts({ limit: 48 })
      .then(({ products }) => {
        if (mounted) setProductos(products)
      })
      .catch((err) => {
        if (mounted)
          setError(err.message || 'No se pudieron cargar los productos.')
      })
      .finally(() => {
        if (mounted) setCargando(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  async function handleAgregar(producto) {
    try {
      setError('')
      await agregarAlCarrito(producto.varianteDisponible.id)

      setToast(producto.nombre)

      setTimeout(() => {
        setToast(null)
      }, 2500)
    } catch (err) {
      setError(err.message || 'No se pudo agregar al carrito.')
    }
  }

  const productosFiltrados = useMemo(() => {
    return productos.filter((producto) => {
      const coincideNombre =
        producto.nombre
          ?.toLowerCase()
          .includes(busqueda.toLowerCase()) ?? false

      const coincideCategoria =
        categoriaSeleccionada === 'Todo' ||
        producto.categoria?.toLowerCase() ===
          categoriaSeleccionada.toLowerCase()

      return coincideNombre && coincideCategoria
    })
  }, [productos, busqueda, categoriaSeleccionada])

  return (
    <div className="explorar-container">

      {toast && (
        <div className="toast-carrito">
          <ShoppingCart size={16} />
          Agregado: {toast}
        </div>
      )}

      <div className="explorar-header">

        <div>

          <h1>Explorar</h1>

          <span>
            {productosFiltrados.length} prendas disponibles
          </span>

        </div>

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

      <div className="explorar-categorias">

        {categorias.map((categoria) => (

          <button
            key={categoria.nombre}
            className={
              categoriaSeleccionada === categoria.nombre
                ? 'categoria active'
                : 'categoria'
            }
            onClick={() =>
              setCategoriaSeleccionada(categoria.nombre)
            }
          >

            {categoria.icono}

            <span>{categoria.nombre}</span>

          </button>

        ))}

      </div>

      {cargando && (
        <div className="explorar-loading">
          Cargando productos...
        </div>
      )}

      {error && (
        <div className="login-error">
          {error}
        </div>
      )}

      {!cargando &&
        !error &&
        productosFiltrados.length === 0 && (
          <div className="explorar-vacio">
            No se encontraron productos.
          </div>
        )}

      {!cargando && !error && (
        <div className="explorar-grid">

          {productosFiltrados.map((producto) => (

            <ProductCard
              key={producto.id}
              producto={producto}
              onAgregar={handleAgregar}
            />

          ))}

        </div>
      )}

    </div>
  )
}