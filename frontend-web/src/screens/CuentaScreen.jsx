import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Package, Heart, MapPin,
  RefreshCw, LogOut, ChevronRight,
  Users, ShoppingBag, BarChart2, Tag, AlertCircle,
  Pencil
} from 'lucide-react'
import { useAuth } from '../context/useAuth'
import '../styles/CuentaScreen.css'

const DEFAULT_AVATAR_URL = 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80'

export default function CuentaScreen() {
  const navigate = useNavigate()
  const { user: usuario, logout, updateProfile } = useAuth()
  const [nombre, setNombre] = useState(usuario?.full_name || '')
  const [avatarUrl, setAvatarUrl] = useState(usuario?.avatar_url || DEFAULT_AVATAR_URL)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [mostrarEditor, setMostrarEditor] = useState(false)

  useEffect(() => {
    setNombre(usuario?.full_name || '')
    setAvatarUrl(usuario?.avatar_url || DEFAULT_AVATAR_URL)
  }, [usuario?.full_name, usuario?.avatar_url])

  async function handleCerrarSesion() {
    await logout()
    navigate('/')
  }

  async function handleGuardarPerfil(event) {
    event.preventDefault()
    setError('')
    setMensaje('')

    if (!nombre.trim()) {
      setError('Escribe un nombre visible para tu perfil.')
      return
    }

    try {
      setGuardando(true)
      await updateProfile({
        full_name: nombre.trim(),
        avatar_url: avatarUrl.trim() || DEFAULT_AVATAR_URL,
      })
      setMensaje('Tu perfil se actualizó correctamente.')
      setMostrarEditor(false)
    } catch (err) {
      setError(err.message || 'No se pudo guardar tu perfil.')
    } finally {
      setGuardando(false)
    }
  }

  function handleArchivoSeleccionado(event) {
    const archivo = event.target.files?.[0]
    if (!archivo) return

    const lector = new FileReader()
    lector.onload = () => {
      setAvatarUrl(String(lector.result))
    }
    lector.onerror = () => {
      setError('No se pudo leer la foto seleccionada.')
    }
    lector.readAsDataURL(archivo)
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

  return (
    <div>
      <div className="cuenta-hero">
        <div className="cuenta-avatar">
          <img
            src={usuario.avatar_url || DEFAULT_AVATAR_URL}
            alt={usuario.full_name}
            className="cuenta-avatar-imagen"
          />
        </div>
        <h1 className="cuenta-nombre">{usuario.full_name}</h1>
      </div>

      <div className="cuenta-body">
        {!mostrarEditor && (
          <div className="cuenta-acciones-editar">
            <button
              type="button"
              className="btn-editar-perfil"
              onClick={() => setMostrarEditor(true)}
            >
              <Pencil size={16} />
              Editar perfil
            </button>
          </div>
        )}

        {mostrarEditor && (
          <form className="cuenta-formulario" onSubmit={handleGuardarPerfil}>
            <div className="cuenta-formulario-header">
              <div>
                <h2>Editar perfil</h2>
                <p>Personaliza tu nombre y foto de perfil.</p>
              </div>
              <Pencil size={16} color="var(--color-accent)" />
            </div>

            <div className="cuenta-form-group">
              <label htmlFor="full_name">Nombre de usuario</label>
              <input
                id="full_name"
                type="text"
                value={nombre}
                onChange={(event) => setNombre(event.target.value)}
              />
            </div>

            <div className="cuenta-form-group">
              <label htmlFor="avatar_file">Foto de perfil</label>
              <input
                id="avatar_file"
                type="file"
                accept="image/*"
                onChange={handleArchivoSeleccionado}
              />
            </div>

            {avatarUrl && (
              <div className="cuenta-preview-avatar">
                <img src={avatarUrl} alt="Vista previa del perfil" />
              </div>
            )}

            {error && <div className="login-error">{error}</div>}
            {mensaje && <div className="cuenta-success">{mensaje}</div>}

            <div className="cuenta-form-buttons">
              <button className="btn-guardar-perfil" type="submit" disabled={guardando}>
                {guardando ? 'Guardando...' : 'Guardar cambios'}
              </button>
              <button
                className="btn-cancelar-perfil"
                type="button"
                onClick={() => {
                  setMostrarEditor(false)
                  setError('')
                  setMensaje('')
                  setNombre(usuario?.full_name || '')
                  setAvatarUrl(usuario?.avatar_url || DEFAULT_AVATAR_URL)
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {(usuario.role === 'cliente' || usuario.role === 'vendedor') && (
          <>
            <div className="cuenta-opciones">
              <button className="cuenta-opcion" onClick={() => navigate('/pedidos')}>
                <div className="cuenta-opcion-icono" style={{ background: '#fff3e0' }}>
                  <Package size={20} color="#f59e0b" />
                </div>
                <div className="cuenta-opcion-texto">
                  <h3>{usuario.role === 'vendedor' ? 'Mis ventas' : 'Mis pedidos'}</h3>
                  <p>{usuario.role === 'vendedor' ? 'Revisa tus pedidos vendidos' : 'Revisa el estado de tus compras'}</p>
                </div>
                <ChevronRight size={16} className="cuenta-opcion-arrow" />
              </button>

              <button
                className="cuenta-opcion"
                onClick={() => navigate('/deseos')}
              >
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
              <button className="cuenta-opcion" onClick={() => navigate('/admin/usuarios')}>
                <div className="cuenta-opcion-icono" style={{ background: '#dcfce7' }}>
                  <Users size={20} color="#16a34a" />
                </div>
                <div className="cuenta-opcion-texto">
                  <h3>Gestionar usuarios</h3>
                  <p>Ver, suspender y eliminar cuentas</p>
                </div>
                <ChevronRight size={16} className="cuenta-opcion-arrow" />
              </button>

              <button className="cuenta-opcion" onClick={() => navigate('/admin/solicitudes')}>
                <div className="cuenta-opcion-icono" style={{ background: '#dbeafe' }}>
                  <ShoppingBag size={20} color="#3b82f6" />
                </div>
                <div className="cuenta-opcion-texto">
                  <h3>Solicitudes</h3>
                  <p>Aprobar o rechazar vendedores</p>
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
