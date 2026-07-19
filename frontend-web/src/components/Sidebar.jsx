import { useState, useEffect, useRef } from 'react'
import { NavLink, Link, useNavigate } from 'react-router-dom'
import {
  Home,
  Grid2x2,
  ShoppingCart,
  User,
  Tag,
  Headphones,
  LogOut,
  Users,
  Package,
  BarChart2
} from 'lucide-react'

import { contarItems } from '../services/carrito'
import { useAuth } from '../context/useAuth'

import '../styles/Sidebar.css'

export default function Sidebar({ abierto, onCerrar }) {
  const navigate = useNavigate()
  const { user: usuario, logout } = useAuth()

  const [itemsCarrito, setItemsCarrito] = useState(0)
  const cartRequestRevision = useRef(0)

  useEffect(() => {
    async function actualizar() {
      const requestRevision = cartRequestRevision.current + 1
      cartRequestRevision.current = requestRevision

      if (!usuario) {
        if (cartRequestRevision.current === requestRevision) setItemsCarrito(0)
        return
      }

      try {
        const count = await contarItems()
        if (cartRequestRevision.current === requestRevision) setItemsCarrito(count)
      } catch {
        if (cartRequestRevision.current === requestRevision) setItemsCarrito(0)
      }
    }

    actualizar()

    window.addEventListener('carritoActualizado', actualizar)
    window.addEventListener('authActualizado', actualizar)

    return () => {
      cartRequestRevision.current += 1
      window.removeEventListener('carritoActualizado', actualizar)
      window.removeEventListener('authActualizado', actualizar)
    }
  }, [usuario])

  async function handleCerrarSesion() {
    await logout()
    navigate('/')
  }

  return (
    <>
      {abierto && <div className="sidebar-backdrop" onClick={onCerrar} />}

      <aside className={`sidebar ${abierto ? 'sidebar-abierto' : ''}`}>

        <button className="sidebar-cerrar" onClick={onCerrar}>
          ✕
        </button>

        <div className="sidebar-logo">
          <span className="logo-eco">Eco</span>
          <span className="logo-bazar">Bazar</span>
          <p className="logo-sub">Moda circular · Durango</p>
        </div>

        <nav className="sidebar-nav">

          <NavLink
            to="/"
            end
            onClick={onCerrar}
            className={({ isActive }) =>
              isActive ? 'nav-item active' : 'nav-item'
            }
          >
            <Home size={17} />
            Inicio
          </NavLink>

          <NavLink
            to="/explorar"
            onClick={onCerrar}
            className={({ isActive }) =>
              isActive ? 'nav-item active' : 'nav-item'
            }
          >
            <Grid2x2 size={17} />
            Explorar
          </NavLink>

          <NavLink
            to="/carrito"
            onClick={onCerrar}
            className={({ isActive }) =>
              isActive ? 'nav-item active' : 'nav-item'
            }
          >
            <ShoppingCart size={17} />
            Carrito

            {itemsCarrito > 0 && (
              <span className="carrito-badge">
                {itemsCarrito}
              </span>
            )}
          </NavLink>

          <NavLink
            to="/cuenta"
            onClick={onCerrar}
            className={({ isActive }) =>
              isActive ? 'nav-item active' : 'nav-item'
            }
          >
            <User size={17} />
            Mi cuenta
          </NavLink>

        </nav>

        <div className="sidebar-divider" />

        <nav className="sidebar-nav">

          {usuario?.role === 'admin' && (
            <>
              <NavLink
                to="/admin/vendedores"
                onClick={onCerrar}
                className={({ isActive }) =>
                  isActive
                    ? 'nav-item nav-item-sm active'
                    : 'nav-item nav-item-sm'
                }
              >
                <Users size={15} />
                Gestionar vendedores
              </NavLink>

              <NavLink
                to="/admin/productos"
                onClick={onCerrar}
                className={({ isActive }) =>
                  isActive
                    ? 'nav-item nav-item-sm active'
                    : 'nav-item nav-item-sm'
                }
              >
                <Package size={15} />
                Gestionar productos
              </NavLink>

              <NavLink
                to="/admin/reportes"
                onClick={onCerrar}
                className={({ isActive }) =>
                  isActive
                    ? 'nav-item nav-item-sm active'
                    : 'nav-item nav-item-sm'
                }
              >
                <BarChart2 size={15} />
                Reportes
              </NavLink>
            </>
          )}

          {(usuario?.role === 'cliente' ||
            usuario?.role === 'vendedor') && (
            <NavLink
              to="/vender"
              onClick={onCerrar}
              className={({ isActive }) =>
                isActive
                  ? 'nav-item nav-item-sm active'
                  : 'nav-item nav-item-sm'
              }
            >
              <Tag size={15} />
              Publicar prenda
            </NavLink>
          )}

          {!usuario && (
            <NavLink
              to="/vender"
              onClick={onCerrar}
              className={({ isActive }) =>
                isActive
                  ? 'nav-item nav-item-sm active'
                  : 'nav-item nav-item-sm'
              }
            >
              <Tag size={15} />
              Quiero vender
            </NavLink>
          )}

          <NavLink
            to="/soporte"
            onClick={onCerrar}
            className={({ isActive }) =>
              isActive
                ? 'nav-item nav-item-sm active'
                : 'nav-item nav-item-sm'
            }
          >
            <Headphones size={15} />
            Atención al cliente
          </NavLink>

          {/* Preguntas frecuentes integrado en pantalla de Soporte */}

        </nav>

        <div className="sidebar-auth">

          {usuario ? (
            <>
              <div className="sidebar-usuario">

                <div className="sidebar-usuario-avatar">
                  <User size={18} color="#fff" />
                </div>

                <div className="sidebar-usuario-info">
                  <p className="sidebar-usuario-nombre">
                    {usuario.full_name}
                  </p>
                </div>

              </div>

              <button
                className="btn-cerrar-sesion"
                onClick={handleCerrarSesion}
              >
                <LogOut size={14} />
                Cerrar sesión
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                onClick={onCerrar}
                className="btn-login"
              >
                Iniciar sesión
              </Link>

              <Link
                to="/registro"
                onClick={onCerrar}
                className="btn-register"
              >
                Crear cuenta
              </Link>
            </>
          )}

        </div>

      </aside>
    </>
  )
}
