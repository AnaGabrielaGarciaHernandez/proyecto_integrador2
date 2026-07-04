import { useNavigate, Link } from 'react-router-dom'
import {
  Package, Heart, MapPin, CreditCard,
  RefreshCw, LogOut, ChevronRight,
  Users, ShoppingBag, BarChart2, Tag, AlertCircle
} from 'lucide-react'
import { useAuth } from '../context/useAuth'
import '../styles/CuentaScreen.css'

export default function CuentaScreen() {
  const navigate = useNavigate()
  const { user: usuario, logout } = useAuth()

  async function handleCerrarSesion() {
    await logout()
    navigate('/')
  }

  if (!usuario) {
    return (
      <div className="cuenta-invitado">
        <AlertCircle size={48} color="var(--color-accent)" strokeWidth={1.5} />
        <h2 className="cuenta-invitado-titulo">Inicia sesión primero</h2>
        <p className="cuenta-invitado-sub">Necesitas una cuenta para publicar en EcoBazar.</p>
        <Link to="/login" className="cuenta-invitado-btn-login">Iniciar sesión</Link>
        <Link to="/registro" className="cuenta-invitado-btn-registro">Crear cuenta</Link>
      </div>
    )
  }

  const rolLabel = {
    cliente:  '🛍 Comprador',
    vendedor: '🏷 Vendedor',
    admin:    '⚙️ Administrador',
  }

  return (
    <div>
      <div className="cuenta-hero">
        <div className="cuenta-avatar">🌿</div>
        <h1 className="cuenta-nombre">{usuario.full_name}</h1>
        <span className="cuenta-rol-badge">{rolLabel[usuario.role] || usuario.role}</span>
      </div>

      <div className="cuenta-body">

        {(usuario.role === 'cliente' || usuario.role === 'vendedor') && (
          <>
            <div className="cuenta-opciones">
              <button className="cuenta-opcion">
                <div className="cuenta-opcion-icono" style={{ background: '#fff3e0' }}>
                  <Package size={20} color="#f59e0b" />
                </div>
                <div className="cuenta-opcion-texto">
                  <h3>Mis pedidos</h3>
                  <p>Revisa el estado de tus compras</p>
                </div>
                <ChevronRight size={16} className="cuenta-opcion-arrow" />
              </button>

              <button className="cuenta-opcion">
                <div className="cuenta-opcion-icono" style={{ background: '#fee2e2' }}>
                  <Heart size={20} color="#ef4444" />
                </div>
                <div className="cuenta-opcion-texto">
                  <h3>Lista de deseos</h3>
                  <p>Productos que guardaste</p>
                </div>
                <ChevronRight size={16} className="cuenta-opcion-arrow" />
              </button>

              <button className="cuenta-opcion">
                <div className="cuenta-opcion-icono" style={{ background: '#ede9fe' }}>
                  <MapPin size={20} color="#8b5cf6" />
                </div>
                <div className="cuenta-opcion-texto">
                  <h3>Mis direcciones</h3>
                  <p>Gestiona tus puntos de entrega</p>
                </div>
                <ChevronRight size={16} className="cuenta-opcion-arrow" />
              </button>

              <button className="cuenta-opcion">
                <div className="cuenta-opcion-icono" style={{ background: '#dbeafe' }}>
                  <CreditCard size={20} color="#3b82f6" />
                </div>
                <div className="cuenta-opcion-texto">
                  <h3>Métodos de pago</h3>
                  <p>Tarjetas y métodos guardados</p>
                </div>
                <ChevronRight size={16} className="cuenta-opcion-arrow" />
              </button>

              {usuario.role === 'vendedor' && (
                <button className="cuenta-opcion">
                  <div className="cuenta-opcion-icono" style={{ background: '#dcfce7' }}>
                    <Tag size={20} color="#16a34a" />
                  </div>
                  <div className="cuenta-opcion-texto">
                    <h3>Mis publicaciones</h3>
                    <p>Ropa que estás vendiendo</p>
                  </div>
                  <ChevronRight size={16} className="cuenta-opcion-arrow" />
                </button>
              )}
            </div>

            {usuario.role === 'cliente' && (
              <Link to="/vender" className="cuenta-banner-vender">
                <RefreshCw size={24} color="#52b788" />
                <div className="cuenta-banner-vender-texto">
                  <h3>¿Tienes ropa sin usar?</h3>
                  <p>Publica gratis y dale una segunda vida</p>
                </div>
                <ChevronRight size={16} color="rgba(255,255,255,0.4)" />
              </Link>
            )}
          </>
        )}

        {usuario.role === 'admin' && (
          <>
            <p className="cuenta-seccion-titulo">Panel de control</p>
            <div className="cuenta-opciones">
              <button className="cuenta-opcion" onClick={() => navigate('/admin/vendedores')}>
                <div className="cuenta-opcion-icono" style={{ background: '#dcfce7' }}>
                  <Users size={20} color="#16a34a" />
                </div>
                <div className="cuenta-opcion-texto">
                  <h3>Gestionar vendedores</h3>
                  <p>Solicitudes y perfiles de vendedores</p>
                </div>
                <ChevronRight size={16} className="cuenta-opcion-arrow" />
              </button>

              <button className="cuenta-opcion" onClick={() => navigate('/admin/productos')}>
                <div className="cuenta-opcion-icono" style={{ background: '#dbeafe' }}>
                  <ShoppingBag size={20} color="#3b82f6" />
                </div>
                <div className="cuenta-opcion-texto">
                  <h3>Gestionar productos</h3>
                  <p>Todo lo que se vende en EcoBazar</p>
                </div>
                <ChevronRight size={16} className="cuenta-opcion-arrow" />
              </button>

              <button className="cuenta-opcion" onClick={() => navigate('/admin/reportes')}>
                <div className="cuenta-opcion-icono" style={{ background: '#fef3c7' }}>
                  <BarChart2 size={20} color="#f59e0b" />
                </div>
                <div className="cuenta-opcion-texto">
                  <h3>Reportes</h3>
                  <p>Estadísticas y métricas</p>
                </div>
                <ChevronRight size={16} className="cuenta-opcion-arrow" />
              </button>
            </div>
          </>
        )}

        <button className="btn-cerrar-sesion-cuenta" onClick={handleCerrarSesion}>
          <LogOut size={16} /> Cerrar sesión
        </button>

      </div>
    </div>
  )
}
