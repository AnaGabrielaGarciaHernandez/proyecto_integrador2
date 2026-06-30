import { NavLink, Link, useNavigate } from 'react-router-dom'
import {
  Home, Grid2x2, ShoppingCart, User,
  Sparkles, Tag, Headphones, HelpCircle,
  LogOut, Users, Package, BarChart2
} from 'lucide-react'
import '../styles/Sidebar.css'

export default function Sidebar({ abierto, onCerrar }) {
  const navigate = useNavigate()
  const usuarioGuardado = localStorage.getItem('usuario')
  const usuario = usuarioGuardado ? JSON.parse(usuarioGuardado) : null

  function handleCerrarSesion() {
    localStorage.removeItem('usuario')
    navigate('/')
    window.location.reload()
  }

  return (
    <>
      {abierto && <div className="sidebar-backdrop" onClick={onCerrar} />}

      <aside className={`sidebar ${abierto ? 'sidebar-abierto' : ''}`}>

        <button className="sidebar-cerrar" onClick={onCerrar}>✕</button>

        <div className="sidebar-logo">
          <span className="logo-eco">Eco</span>
          <span className="logo-bazar">Bazar</span>
          <p className="logo-sub">Moda circular · Durango</p>
        </div>

        {/* Nav principal — igual para todos */}
        <nav className="sidebar-nav">
          <NavLink to="/" end onClick={onCerrar} className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <Home size={17} /> Inicio
          </NavLink>
          <NavLink to="/explorar" onClick={onCerrar} className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <Grid2x2 size={17} /> Explorar
          </NavLink>
          <NavLink to="/carrito" onClick={onCerrar} className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <ShoppingCart size={17} /> Carrito
          </NavLink>
          <NavLink to="/cuenta" onClick={onCerrar} className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <User size={17} /> Mi cuenta
          </NavLink>
        </nav>

        <div className="sidebar-divider" />

        {/* Nav secundaria según rol */}
        <nav className="sidebar-nav">
          <NavLink to="/recientes" onClick={onCerrar} className={({ isActive }) => isActive ? 'nav-item nav-item-sm active' : 'nav-item nav-item-sm'}>
            <Sparkles size={15} /> Recién llegados
          </NavLink>

          {/* Admin */}
          {usuario?.rol === 'admin' && <>
            <NavLink to="/admin/vendedores" onClick={onCerrar} className={({ isActive }) => isActive ? 'nav-item nav-item-sm active' : 'nav-item nav-item-sm'}>
              <Users size={15} /> Gestionar vendedores
            </NavLink>
            <NavLink to="/admin/productos" onClick={onCerrar} className={({ isActive }) => isActive ? 'nav-item nav-item-sm active' : 'nav-item nav-item-sm'}>
              <Package size={15} /> Gestionar productos
            </NavLink>
            <NavLink to="/admin/reportes" onClick={onCerrar} className={({ isActive }) => isActive ? 'nav-item nav-item-sm active' : 'nav-item nav-item-sm'}>
              <BarChart2 size={15} /> Reportes
            </NavLink>
          </>}

          {/* Cliente y Vendedor */}
          {(usuario?.rol === 'cliente' || usuario?.rol === 'vendedor') && <>
            <NavLink to="/vender" onClick={onCerrar} className={({ isActive }) => isActive ? 'nav-item nav-item-sm active' : 'nav-item nav-item-sm'}>
              <Tag size={15} /> Publicar prenda
            </NavLink>
          </>}

          {/* Invitado */}
          {!usuario && <>
            <NavLink to="/vender" onClick={onCerrar} className={({ isActive }) => isActive ? 'nav-item nav-item-sm active' : 'nav-item nav-item-sm'}>
              <Tag size={15} /> Quiero vender
            </NavLink>
          </>}

          <NavLink to="/soporte" onClick={onCerrar} className={({ isActive }) => isActive ? 'nav-item nav-item-sm active' : 'nav-item nav-item-sm'}>
            <Headphones size={15} /> Atención al cliente
          </NavLink>
          <NavLink to="/faq" onClick={onCerrar} className={({ isActive }) => isActive ? 'nav-item nav-item-sm active' : 'nav-item nav-item-sm'}>
            <HelpCircle size={15} /> Preguntas frecuentes
          </NavLink>
        </nav>

        {/* Footer según rol */}
        <div className="sidebar-auth">
          {usuario ? (
            <>
              <div className="sidebar-usuario">
                <div className="sidebar-usuario-avatar">
                  <User size={18} color="#fff" />
                </div>
                <div className="sidebar-usuario-info">
                  <p className="sidebar-usuario-nombre">{usuario.nombre}</p>
                  <p className="sidebar-usuario-rol">{usuario.rol}</p>
                </div>
              </div>
              <button className="btn-cerrar-sesion" onClick={handleCerrarSesion}>
                <LogOut size={14} /> Cerrar sesión
              </button>
            </>
          ) : (
            <>
              <Link to="/login" onClick={onCerrar} className="btn-login">Iniciar sesión</Link>
              <Link to="/registro" onClick={onCerrar} className="btn-register">Crear cuenta</Link>
            </>
          )}
        </div>

      </aside>
    </>
  )
}