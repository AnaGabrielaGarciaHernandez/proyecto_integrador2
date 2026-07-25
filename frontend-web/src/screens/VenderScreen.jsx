import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { get, post } from '../services/api'
import '../styles/VenderScreen.css'

export default function VenderScreen() {
  const { user, loading } = useAuth()

  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    nombreTienda: '', telefono: '', email: '', direccion: '', descripcion: ''
  })
  const [emailEdited, setEmailEdited] = useState(false)
  const [publicacion, setPublicacion] = useState({ nombre: '', categoria: '', precio: '', descripcion: '' })
  const [mensaje, setMensaje] = useState('')
  const [application, setApplication] = useState(null)
  const [applicationLoading, setApplicationLoading] = useState(true)
  const [applicationError, setApplicationError] = useState('')
  const [submittingApplication, setSubmittingApplication] = useState(false)
  const [pubStep, setPubStep] = useState(1)
  const categorias = [
    'Sudaderas & Chamarras',
    'Chaquetas & Abrigos',
    'Pantalones',
    'Pants & Joggers',
    'Camisas',
    'Camisetas & Tops',
    'Vestidos & Faldas',
    'Calzado',
    'Accesorios',
  ]

  const userId = user?.id
  const userRole = user?.role
  useEffect(() => {
    if (loading || !userId || userRole !== 'cliente') return undefined

    let mounted = true
    get('/seller-applications/me')
      .then((data) => {
        if (mounted) setApplication(data?.application || null)
      })
      .catch((error) => {
        if (mounted) setApplicationError(error.message || 'No pudimos consultar tu solicitud.')
      })
      .finally(() => {
        if (mounted) setApplicationLoading(false)
      })

    return () => { mounted = false }
  }, [loading, userId, userRole])

  if (loading) return <div style={{ padding: 40 }}>Cargando...</div>

  // Invitado
  if (!user) {
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

  // Cliente: formulario para solicitar ser vendedor
  if (user.role === 'cliente') {
    async function handleApplicationSubmit(event) {
      event.preventDefault()
      setSubmittingApplication(true)
      setMensaje('')
      setApplicationError('')

      try {
        const data = await post('/seller-applications', {
          requested_display_name: form.nombreTienda.trim(),
          contact_phone: form.telefono.trim(),
          contact_email: (emailEdited ? form.email : (form.email || user.email || '')).trim(),
          contact_address: form.direccion.trim(),
          description: form.descripcion.trim(),
        })
        setApplication(data?.application || null)
        setStep(1)
        setMensaje('Solicitud enviada. Nuestro equipo revisará la información de tu tienda.')
      } catch (error) {
        setApplicationError(error.message || 'No pudimos enviar tu solicitud.')
      } finally {
        setSubmittingApplication(false)
      }
    }

    const blockedByApplication = ['pending', 'approved', 'suspended'].includes(application?.status)

    return (
      <div className="vender-container">
        <div className="vender-hero">
          <div className="vender-hero-top">HAZ CRECER TU TIENDA</div>
          <h2>Vende en EcoBazar</h2>
        </div>

        <div className="vender-body">
          {mensaje && <div className="vender-success" role="status">{mensaje}</div>}
          {applicationError && <div className="vender-error" role="alert">{applicationError}</div>}

          {applicationLoading ? (
            <p className="vender-status-loading">Consultando el estado de tu solicitud...</p>
          ) : (
            <>
              {blockedByApplication && (
                <div className={`vender-application-status ${application.status}`} role="status">
                  <h3>{getApplicationStatusTitle(application.status)}</h3>
                  <p>
                    {application.status === 'pending'
                      ? 'Nuestro equipo revisará la información de tu tienda. Te avisaremos cuando termine el proceso.'
                      : application.status === 'suspended'
                      ? 'La actividad de tu tienda está suspendida. Si necesitas ayuda, contacta al equipo de EcoBazar.'
                      : 'Tu cuenta está en proceso de activación como tienda. Ya no necesitas enviar otra solicitud.'}
                  </p>
                  <small>Solicitud enviada el {formatApplicationDate(application.created_at)}.</small>
                </div>
              )}

              {application?.status === 'rejected' && (
                <div className="vender-application-status rejected" role="alert">
                  <h3>Tu solicitud necesita algunos cambios</h3>
                  <p>{application.rejection_reason || 'Puedes actualizar la información y enviarla nuevamente.'}</p>
                </div>
              )}

              {!blockedByApplication && (
                <>
                  {step === 1 && (
                    <section className="vender-pitch" aria-labelledby="vender-pitch-title">
                      <p className="vender-pitch-eyebrow">Una vitrina para tu negocio</p>
                      <h3 id="vender-pitch-title">Convierte tu tienda en una experiencia que más personas puedan descubrir.</h3>
                      <p>
                        EcoBazar conecta tiendas de moda circular con compradores que buscan prendas con historia.
                        Presenta tu negocio, muestra tu catálogo y llega a nuevos clientes desde un espacio pensado para vender mejor.
                      </p>
                      <ul>
                        <li>Haz visible tu tienda frente a una comunidad interesada en consumo responsable.</li>
                        <li>Construye una presencia digital para tus prendas y tu propuesta.</li>
                        <li>Recibe acompañamiento durante la revisión de tu solicitud.</li>
                      </ul>
                      <div className="vender-actions">
                        <button className="btn-primary" type="button" onClick={() => setStep(2)}>Continuar con mi solicitud</button>
                      </div>
                    </section>
                  )}

                  {step === 2 && (
                    <form className="vender-form" onSubmit={handleApplicationSubmit}>
                      <p className="vender-step-label">Cuéntanos sobre tu tienda o negocio</p>

                      <label htmlFor="seller-store-name">Nombre de la tienda</label>
                      <input
                        id="seller-store-name"
                        value={form.nombreTienda}
                        onChange={(event) => setForm({ ...form, nombreTienda: event.target.value })}
                        maxLength={180}
                        required
                      />

                      <label htmlFor="seller-phone">Teléfono de contacto</label>
                      <input
                        id="seller-phone"
                        type="tel"
                        value={form.telefono}
                        onChange={(event) => setForm({ ...form, telefono: event.target.value })}
                        maxLength={30}
                        required
                      />

                      <label htmlFor="seller-email">Correo de contacto</label>
                      <input
                        id="seller-email"
                        type="email"
                        value={emailEdited ? form.email : (form.email || user.email || '')}
                        onChange={(event) => {
                          setEmailEdited(true)
                          setForm({ ...form, email: event.target.value })
                        }}
                        maxLength={255}
                        required
                      />

                      <label htmlFor="seller-address">Dirección completa del negocio</label>
                      <input
                        id="seller-address"
                        value={form.direccion}
                        onChange={(event) => setForm({ ...form, direccion: event.target.value })}
                        maxLength={255}
                        placeholder="Calle, número, colonia y referencias"
                        required
                      />

                      <label htmlFor="seller-description">Cuéntanos sobre tu negocio</label>
                      <textarea
                        id="seller-description"
                        value={form.descripcion}
                        onChange={(event) => setForm({ ...form, descripcion: event.target.value })}
                        maxLength={2000}
                        placeholder="Qué vendes, desde cuándo y qué hace especial a tu tienda"
                        required
                      />

                      <div className="vender-actions">
                        <button className="btn-ghost" type="button" onClick={() => setStep(1)}>Volver</button>
                        <button className="btn-primary" type="submit" disabled={submittingApplication}>
                          {submittingApplication ? 'Enviando...' : 'Enviar solicitud'}
                        </button>
                      </div>
                    </form>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  // Vendedor: flujo de publicación en 3 pasos
  function toggleSize(size) {
    const sizes = publicacion.sizes || []
    if (sizes.includes(size)) {
      setPublicacion({ ...publicacion, sizes: sizes.filter(s => s !== size) })
    } else {
      setPublicacion({ ...publicacion, sizes: [...sizes, size] })
    }
  }

  function selectCondition(cond) {
    setPublicacion({ ...publicacion, condition: cond })
  }

  function handlePublish() {
    setMensaje('Producto publicado (simulado).')
    setPubStep(1)
    setPublicacion({ nombre: '', categoria: '', precio: '', descripcion: '', sizes: [] })
  }

  return (
    <div className="vender-container">
      <div className="vender-hero">
        <div className="vender-hero-top">NUEVA PUBLICACIÓN</div>
        <h2>Publicar prenda</h2>

        <div className="publish-steps">
          <div className={`step ${pubStep >= 1 ? 'active' : ''}`}>1</div>
          <div className={`bar ${pubStep >= 2 ? 'active' : ''}`} />
          <div className={`step ${pubStep >= 2 ? 'active' : ''}`}>2</div>
          <div className={`bar ${pubStep >= 3 ? 'active' : ''}`} />
          <div className={`step ${pubStep >= 3 ? 'active' : ''}`}>3</div>
        </div>
      </div>

      <div className="vender-body">

        {pubStep === 1 && (
          <div>
            <p className="vender-step-label">¿Qué tipo de prenda vas a publicar?</p>
            <div className="category-grid">
              {categorias.map((c) => (
                <button key={c} className={publicacion.categoria === c ? 'category active' : 'category'} onClick={() => setPublicacion({ ...publicacion, categoria: c })}>
                  <span>{c}</span>
                </button>
              ))}
            </div>

            <div className="vender-actions">
              <button className="btn-ghost" onClick={() => { /* no-op */ }}>Anterior</button>
              <button className="btn-primary" onClick={() => setPubStep(2)} disabled={!publicacion.categoria}>Continuar</button>
            </div>
          </div>
        )}

        {pubStep === 2 && (
          <div>
            <p className="vender-step-label">Detalles de la prenda</p>

            <div className="vender-form">
              <label>Nombre</label>
              <input value={publicacion.nombre} onChange={(e) => setPublicacion({ ...publicacion, nombre: e.target.value })} />

              <label>Talla</label>
              <div className="sizes">
                {['XS','S','M','L','XL','XXL'].map(s => (
                  <button key={s} type="button" className={publicacion.sizes?.includes(s) ? 'size active' : 'size'} onClick={() => toggleSize(s)}>{s}</button>
                ))}
              </div>

              <label>Estado de la prenda</label>
              <div className="conditions">
                {[
                  {k: 'Seminuevo', desc: 'Prácticamente sin uso'},
                  {k: 'Buen estado', desc: 'Usado con cuidado'},
                  {k: 'Usado', desc: 'Uso moderado'},
                  {k: 'Desgastado', desc: 'Signos de desgaste'},
                ].map(c => (
                  <div key={c.k} className={publicacion.condition === c.k ? 'condition active' : 'condition'} onClick={() => selectCondition(c.k)}>
                    <div className="cond-title">{c.k}</div>
                    <div className="cond-desc">{c.desc}</div>
                  </div>
                ))}
              </div>

              <label>Descripción</label>
              <textarea value={publicacion.descripcion} onChange={(e) => setPublicacion({ ...publicacion, descripcion: e.target.value })} />

              <label>Fotos</label>
              <div className="upload-box">Subir imágenes (arrastra o haz click)</div>

              <div className="vender-actions">
                <button className="btn-ghost" onClick={() => setPubStep(1)}>Anterior</button>
                <button className="btn-primary" onClick={() => setPubStep(3)}>Continuar</button>
              </div>
            </div>
          </div>
        )}

        {pubStep === 3 && (
          <div>
            <p className="vender-step-label">Previsualización</p>
            <div className="preview-card">
              <h3>{publicacion.nombre || '(Sin nombre)'}</h3>
              <p className="preview-meta">{publicacion.categoria} · {publicacion.sizes?.join(', ')}</p>
              <p className="preview-desc">{publicacion.descripcion}</p>
              <p className="preview-price">{publicacion.precio ? `$ ${publicacion.precio}` : ''}</p>
            </div>

            <div className="vender-actions">
              <button className="btn-ghost" onClick={() => setPubStep(2)}>Anterior</button>
              <button className="btn-primary" onClick={handlePublish}>Publicar</button>
            </div>
          </div>
        )}

        {mensaje && <div className="vender-success">{mensaje}</div>}

      </div>
    </div>
  )
}

function formatApplicationDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('es-MX', { dateStyle: 'long' })
}

function getApplicationStatusTitle(status) {
  return {
    pending: 'Tu solicitud está en revisión',
    approved: 'Tu solicitud ya fue aprobada',
    suspended: 'Tu cuenta de tienda está suspendida',
  }[status] || 'Estado de solicitud'
}
