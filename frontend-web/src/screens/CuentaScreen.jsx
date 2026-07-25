import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Package, Heart, MapPin,
  RefreshCw, LogOut, ChevronRight,
  Users, ShoppingBag, BarChart2, Tag, AlertCircle,
  Pencil, Download, ShieldCheck, Trash2
} from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { DEFAULT_AVATAR_URL } from '../constants/avatar'
import { createAvatarPreview, validateAvatarFile } from '../services/avatar'
import '../styles/CuentaScreen.css'

export default function CuentaScreen() {
  const navigate = useNavigate()
  const {
    user: usuario,
    logout,
    updateProfile,
    exportPrivacyData,
    requestAccountDeletion,
  } = useAuth()
  const [nombreBorrador, setNombreBorrador] = useState({ userId: null, value: null })
  const [nuevaFoto, setNuevaFoto] = useState({ userId: null, file: null, url: null })
  const previewUrlRef = useRef(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [mostrarEditor, setMostrarEditor] = useState(false)
  const [privacidadCargando, setPrivacidadCargando] = useState(false)
  const [mostrarEliminacion, setMostrarEliminacion] = useState(false)
  const [confirmacionEliminacion, setConfirmacionEliminacion] = useState('')

  const nombre = nombreBorrador.userId === usuario?.id && nombreBorrador.value !== null
    ? nombreBorrador.value
    : usuario?.full_name || ''
  const nuevaFotoUrl = nuevaFoto.userId === usuario?.id ? nuevaFoto.url : null
  const nuevaFotoFile = nuevaFoto.userId === usuario?.id ? nuevaFoto.file : null

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
  }, [])

  function limpiarNuevaFoto() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setNuevaFoto({ userId: usuario?.id || null, file: null, url: null })
  }

  async function handleCerrarSesion() {
    await logout()
    navigate('/')
  }

  async function handleExportarDatos() {
    setError('')
    setMensaje('')
    try {
      setPrivacidadCargando(true)
      const data = await exportPrivacyData()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = `ecobazar-datos-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
      setMensaje('Preparamos una copia de tus datos.')
    } catch (err) {
      setError(err.message || 'No se pudo exportar tu información.')
    } finally {
      setPrivacidadCargando(false)
    }
  }

  async function handleSolicitarEliminacion() {
    if (confirmacionEliminacion !== 'ELIMINAR') {
      setError('Escribe ELIMINAR para confirmar la eliminación de tu cuenta.')
      return
    }

    setError('')
    try {
      setPrivacidadCargando(true)
      await requestAccountDeletion()
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'No se pudo solicitar la eliminación de tu cuenta.')
    } finally {
      setPrivacidadCargando(false)
    }
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
      const profile = {
        full_name: nombre.trim(),
      }
      if (nuevaFotoFile) profile.avatar = nuevaFotoFile

      const updatedUser = await updateProfile(profile)
      setMensaje('Tu perfil se actualizó correctamente.')
      setNombreBorrador({ userId: updatedUser.id, value: null })
      limpiarNuevaFoto()
      setMostrarEditor(false)
    } catch (err) {
      setError(err.message || 'No se pudo guardar tu perfil.')
    } finally {
      setGuardando(false)
    }
  }

  async function handleArchivoSeleccionado(event) {
    const archivo = event.target.files?.[0]
    if (!archivo) return

    setError('')
    try {
      const file = validateAvatarFile(archivo)
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      const previewUrl = createAvatarPreview(file)
      previewUrlRef.current = previewUrl
      setNuevaFoto({
        userId: usuario.id,
        file,
        url: previewUrl,
      })
    } catch (err) {
      setError(err.message || 'No se pudo leer la foto seleccionada.')
    } finally {
      event.target.value = ''
    }
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
                onChange={(event) => setNombreBorrador({
                  userId: usuario.id,
                  value: event.target.value,
                })}
              />
            </div>

            <div className="cuenta-form-group">
              <label htmlFor="avatar_file">Foto de perfil</label>
              <input
                id="avatar_file"
                className="cuenta-file-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleArchivoSeleccionado}
              />
              <label className="cuenta-file-trigger" htmlFor="avatar_file">
                <Pencil size={16} aria-hidden="true" />
                Cambiar foto de perfil
              </label>
            </div>

            {nuevaFotoUrl && (
              <div className="cuenta-preview-avatar">
                <img src={nuevaFotoUrl} alt="Vista previa de la nueva foto" />
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
                  setNombreBorrador({ userId: usuario.id, value: null })
                  limpiarNuevaFoto()
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

        <section className="cuenta-privacidad" aria-labelledby="cuenta-privacidad-titulo">
          <div className="cuenta-privacidad-header">
            <div className="cuenta-privacidad-icono">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h2 id="cuenta-privacidad-titulo">Privacidad y tus datos</h2>
              <p>Consulta o controla la información asociada con tu cuenta.</p>
            </div>
          </div>

          <div className="cuenta-privacidad-actions">
            <button
              type="button"
              className="cuenta-privacidad-exportar"
              onClick={handleExportarDatos}
              disabled={privacidadCargando}
            >
              <Download size={17} />
              {privacidadCargando ? 'Procesando...' : 'Descargar mis datos'}
            </button>
            <Link className="cuenta-privacidad-link" to="/privacidad">
              Leer aviso de privacidad
              <ChevronRight size={15} />
            </Link>
          </div>

          <div className="cuenta-privacidad-eliminar">
            <div>
              <h3>Eliminar mi cuenta</h3>
              <p>La solicitud es irreversible. Procesaremos la eliminación y conservaremos únicamente lo necesario por obligación legal.</p>
            </div>
            {!mostrarEliminacion ? (
              <button
                type="button"
                className="cuenta-privacidad-eliminar-btn"
                onClick={() => {
                  setMostrarEliminacion(true)
                  setConfirmacionEliminacion('')
                  setError('')
                }}
              >
                <Trash2 size={16} />
                Solicitar eliminación
              </button>
            ) : (
              <div className="cuenta-privacidad-confirmacion">
                <label htmlFor="confirmar-eliminacion">
                  Escribe <strong>ELIMINAR</strong> para confirmar
                </label>
                <input
                  id="confirmar-eliminacion"
                  type="text"
                  value={confirmacionEliminacion}
                  onChange={(event) => setConfirmacionEliminacion(event.target.value)}
                  autoComplete="off"
                />
                <div className="cuenta-privacidad-confirmacion-actions">
                  <button
                    type="button"
                    className="cuenta-privacidad-cancelar"
                    onClick={() => {
                      setMostrarEliminacion(false)
                      setConfirmacionEliminacion('')
                    }}
                    disabled={privacidadCargando}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="cuenta-privacidad-confirmar"
                    onClick={handleSolicitarEliminacion}
                    disabled={privacidadCargando || confirmacionEliminacion !== 'ELIMINAR'}
                  >
                    {privacidadCargando ? 'Enviando...' : 'Eliminar cuenta'}
                  </button>
                </div>
              </div>
            )}
          </div>
          {error && <div className="login-error" role="alert">{error}</div>}
          {mensaje && <div className="cuenta-success" role="status">{mensaje}</div>}
        </section>

        <button className="btn-cerrar-sesion-cuenta" onClick={handleCerrarSesion}>
          <LogOut size={16} /> Cerrar sesión
        </button>

      </div>
    </div>
  )
}
