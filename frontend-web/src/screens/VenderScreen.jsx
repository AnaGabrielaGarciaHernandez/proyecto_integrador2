import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import '../styles/VenderScreen.css'

export default function VenderScreen() {
  const { user, loading } = useAuth()

  const [step, setStep] = useState(1)
  const [tipoCuenta, setTipoCuenta] = useState('persona')
  const [form, setForm] = useState({
    nombreTienda: '', telefono: '', email: '', direccion: ''
  })
  const [publicacion, setPublicacion] = useState({ nombre: '', categoria: '', precio: '', descripcion: '' })
  const [mensaje, setMensaje] = useState('')
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
    return (
      <div className="vender-container">
        <div className="vender-hero">
          <h2>Quiero publicar</h2>
        </div>

        <div className="vender-body">
          {mensaje && <div className="vender-success">{mensaje}</div>}

          {step === 1 && (
            <>
              <p className="vender-step-label">¿Cómo quieres publicar en EcoBazar?</p>
              <div className="vender-choices">
                <button className={tipoCuenta === 'persona' ? 'choice active' : 'choice'} onClick={() => setTipoCuenta('persona')}>
                  <h4>Persona física</h4>
                  <p>Vendo ropa propia que ya no uso.</p>
                </button>

                <button className={tipoCuenta === 'negocio' ? 'choice active' : 'choice'} onClick={() => setTipoCuenta('negocio')}>
                  <h4>Tienda o negocio</h4>
                  <p>Tengo un local o negocio de ropa de segunda mano.</p>
                </button>
              </div>

              <div className="vender-actions">
                <button className="btn-primary" onClick={() => setStep(2)}>Continuar</button>
              </div>
            </>
          )}

          {step === 2 && (
            <div>
              <p className="vender-step-label">Información de tu {tipoCuenta === 'negocio' ? 'tienda o negocio' : 'persona'}</p>

              {tipoCuenta === 'negocio' ? (
                <div className="vender-form">
                  <label>Nombre de la tienda</label>
                  <input value={form.nombreTienda} onChange={(e) => setForm({ ...form, nombreTienda: e.target.value })} />

                  <label>Teléfono del negocio</label>
                  <input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />

                  <label>Correo del negocio</label>
                  <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />

                  <label>Dirección del local</label>
                  <input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />

                  <div className="vender-actions">
                    <button className="btn-ghost" onClick={() => setStep(1)}>Volver</button>
                    <button className="btn-primary" onClick={() => { setMensaje('Solicitud enviada. Nuestro equipo revisará tu información.'); setStep(1) }}>Enviar</button>
                  </div>
                </div>
              ) : (
                <div className="vender-form">
                  <p>Como persona física, solo confirma tu interés y empieza a publicar después de la revisión.</p>
                  <div className="vender-actions">
                    <button className="btn-ghost" onClick={() => setStep(1)}>Volver</button>
                    <button className="btn-primary" onClick={() => { setMensaje('Solicitud enviada. Nuestro equipo revisará tu información.'); setStep(1) }}>Enviar</button>
                  </div>
                </div>
              )}
            </div>
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
