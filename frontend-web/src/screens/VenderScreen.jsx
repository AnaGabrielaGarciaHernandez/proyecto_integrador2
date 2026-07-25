import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ImagePlus,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { get, post } from '../services/api'
import { createSellerProduct, getCategories } from '../services/seller'
import '../styles/VenderScreen.css'

const CONDITIONS = [
  { value: 'nuevo', label: 'Nuevo', description: 'Sin uso y con excelente presentación' },
  { value: 'como nuevo', label: 'Como nuevo', description: 'Prácticamente sin uso' },
  { value: 'buen estado', label: 'Buen estado', description: 'Usado con cuidado' },
  { value: 'usado', label: 'Usado', description: 'Tiene señales normales de uso' },
  { value: 'muy usado', label: 'Muy usado', description: 'Presenta desgaste visible' },
]

const INITIAL_PRODUCT = {
  name: '',
  description: '',
  condition: 'buen estado',
  price: '',
  categoryId: '',
}

export default function VenderScreen() {
  const { user, loading } = useAuth()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    nombreTienda: '', telefono: '', email: '', direccion: '', descripcion: '',
  })
  const [emailEdited, setEmailEdited] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [application, setApplication] = useState(null)
  const [applicationLoading, setApplicationLoading] = useState(true)
  const [applicationError, setApplicationError] = useState('')
  const [submittingApplication, setSubmittingApplication] = useState(false)

  const [product, setProduct] = useState(INITIAL_PRODUCT)
  const [categories, setCategories] = useState([])
  const [categoriesLoading, setCategoriesLoading] = useState(false)
  const [productImages, setProductImages] = useState([])
  const [variants, setVariants] = useState([{ size_name: 'M', stock: 1 }])
  const [productError, setProductError] = useState('')
  const [productSuccess, setProductSuccess] = useState(null)
  const [submittingProduct, setSubmittingProduct] = useState(false)
  const imageInputRef = useRef(null)
  const imagesRef = useRef(productImages)

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

  useEffect(() => {
    if (loading || !userId || userRole !== 'vendedor') return undefined
    let mounted = true
    getCategories()
      .then((data) => {
        if (mounted) setCategories(data)
      })
      .catch((error) => {
        if (mounted) setProductError(error.message || 'No pudimos cargar las categorías.')
      })
      .finally(() => {
        if (mounted) setCategoriesLoading(false)
      })
    return () => { mounted = false }
  }, [loading, userId, userRole])

  useEffect(() => {
    imagesRef.current = productImages
  }, [productImages])

  useEffect(() => () => {
    imagesRef.current.forEach((image) => URL.revokeObjectURL(image.preview))
  }, [])

  if (loading) return <div style={{ padding: 40 }}>Cargando...</div>

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

  if (user.role === 'cliente') {
    return <SellerApplicationForm
      application={application}
      applicationError={applicationError}
      applicationLoading={applicationLoading}
      emailEdited={emailEdited}
      form={form}
      mensaje={mensaje}
      setApplication={setApplication}
      setApplicationError={setApplicationError}
      setEmailEdited={setEmailEdited}
      setForm={setForm}
      setMensaje={setMensaje}
      setStep={setStep}
      step={step}
      submittingApplication={submittingApplication}
      setSubmittingApplication={setSubmittingApplication}
      user={user}
    />
  }

  if (user.role !== 'vendedor') {
    return (
      <div className="vender-body">
        <div className="vender-error" role="alert">Tu cuenta no tiene permisos para publicar productos.</div>
      </div>
    )
  }

  function updateProduct(field, value) {
    setProduct((current) => ({ ...current, [field]: value }))
  }

  function addImages(fileList) {
    const files = Array.from(fileList || [])
    if (files.length === 0) return
    const allowed = files.filter((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    if (allowed.length !== files.length) {
      setProductError('Solo puedes subir imágenes JPEG, PNG o WebP.')
    }
    const available = Math.max(0, 8 - productImages.length)
    if (allowed.length > available) {
      setProductError('Una publicación puede tener hasta 8 imágenes.')
    }
    const next = allowed.slice(0, available).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }))
    setProductImages((current) => [...current, ...next])
  }

  function removeImage(index) {
    setProductImages((current) => {
      const removed = current[index]
      if (removed) URL.revokeObjectURL(removed.preview)
      return current.filter((_, itemIndex) => itemIndex !== index)
    })
  }

  function moveImage(index, direction) {
    setProductImages((current) => {
      const target = index + direction
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
  }

  function addVariant() {
    setVariants((current) => [...current, { size_name: '', stock: 0 }])
  }

  function updateVariant(index, field, value) {
    setVariants((current) => current.map((variant, variantIndex) => (
      variantIndex === index ? { ...variant, [field]: value } : variant
    )))
  }

  function removeVariant(index) {
    setVariants((current) => current.length <= 1 ? current : current.filter((_, itemIndex) => itemIndex !== index))
  }

  function resetProductForm() {
    productImages.forEach((image) => URL.revokeObjectURL(image.preview))
    setProduct(INITIAL_PRODUCT)
    setVariants([{ size_name: 'M', stock: 1 }])
    setProductImages([])
  }

  async function handleProductSubmit(event) {
    event.preventDefault()
    setProductError('')
    setProductSuccess(null)
    if (productImages.length === 0) {
      setProductError('Agrega al menos una imagen para publicar.')
      return
    }
    if (!product.name.trim() || !product.description.trim() || !product.price || !product.categoryId) {
      setProductError('Completa todos los campos de la publicación.')
      return
    }
    if (variants.some((variant) => !variant.size_name.trim() || Number(variant.stock) < 0)
      || variants.every((variant) => Number(variant.stock) <= 0)) {
      setProductError('Agrega una variante con stock positivo.')
      return
    }

    const payload = new FormData()
    payload.append('name', product.name.trim())
    payload.append('description', product.description.trim())
    payload.append('condition', product.condition)
    payload.append('price_mxn', product.price)
    payload.append('category_id', product.categoryId)
    payload.append('variants', JSON.stringify(variants.map((variant) => ({
      size_name: variant.size_name.trim(),
      stock: Number(variant.stock),
    }))))
    productImages.forEach((image) => payload.append('images', image.file, image.file.name))

    setSubmittingProduct(true)
    try {
      const data = await createSellerProduct(payload)
      const created = data?.product
      setProductSuccess(created || { id: '—' })
      setMensaje('Publicación creada correctamente.')
      resetProductForm()
    } catch (error) {
      setProductError(error.message || 'No pudimos publicar el producto.')
    } finally {
      setSubmittingProduct(false)
    }
  }

  return (
    <div className="vender-container">
      <div className="vender-hero">
        <div className="vender-hero-top">NUEVA PUBLICACIÓN</div>
        <h2>Publicar prenda</h2>
        <p className="vender-hero-description">Tu publicación se mostrará inmediatamente en Explorar después de validarse.</p>
      </div>

      <div className="vender-body">
        {productError && <div className="vender-error" role="alert">{productError}</div>}
        {productSuccess && (
          <div className="vender-success" role="status">
            <strong>Publicación creada.</strong> ID real: <code>{productSuccess.id}</code>
            <Link to="/panel-vendedor" className="vender-success-link">Administrar en el panel de vendedor →</Link>
          </div>
        )}

        <form className="vender-form vender-product-form" onSubmit={handleProductSubmit}>
          <section className="vender-form-section">
            <div className="vender-section-heading">
              <div>
                <p className="vender-step-label">Información del producto</p>
                <p className="vender-help">Describe la prenda con claridad para ayudar a quien compra.</p>
              </div>
            </div>

            <label htmlFor="product-name">Nombre del producto</label>
            <input
              id="product-name"
              value={product.name}
              onChange={(event) => updateProduct('name', event.target.value)}
              maxLength={180}
              placeholder="Ej. Chamarra de mezclilla vintage"
              disabled={submittingProduct}
              required
            />

            <label htmlFor="product-description">Descripción</label>
            <textarea
              id="product-description"
              value={product.description}
              onChange={(event) => updateProduct('description', event.target.value)}
              maxLength={5000}
              placeholder="Medidas, materiales, detalles y cualquier señal de uso..."
              disabled={submittingProduct}
              required
            />

            <label>Estado de la prenda</label>
            <div className="conditions" role="radiogroup" aria-label="Estado de la prenda">
              {CONDITIONS.map((condition) => (
                <button
                  key={condition.value}
                  type="button"
                  className={product.condition === condition.value ? 'condition active' : 'condition'}
                  onClick={() => updateProduct('condition', condition.value)}
                  disabled={submittingProduct}
                  role="radio"
                  aria-checked={product.condition === condition.value}
                >
                  <span className="cond-title">{condition.label}</span>
                  <span className="cond-desc">{condition.description}</span>
                </button>
              ))}
            </div>

            <label htmlFor="product-price">Precio (MXN)</label>
            <div className="price-input-wrap">
              <span>$</span>
              <input
                id="product-price"
                type="number"
                min="0.01"
                max="1000000"
                step="0.01"
                value={product.price}
                onChange={(event) => updateProduct('price', event.target.value)}
                placeholder="0.00"
                disabled={submittingProduct}
                required
              />
            </div>
          </section>

          <section className="vender-form-section">
            <div className="vender-section-heading">
              <div>
                <p className="vender-step-label">Tallas y stock</p>
                <p className="vender-help">Indica cuántas unidades tienes disponibles por variante.</p>
              </div>
              <button type="button" className="vender-small-action" onClick={addVariant} disabled={submittingProduct}>+ Agregar variante</button>
            </div>
            <div className="variants-editor">
              {variants.map((variant, index) => (
                <div className="variant-editor-row" key={`${index}-${variant.size_name}`}>
                  <label htmlFor={`variant-size-${index}`}>Talla o variante</label>
                  <input
                    id={`variant-size-${index}`}
                    value={variant.size_name}
                    onChange={(event) => updateVariant(index, 'size_name', event.target.value)}
                    maxLength={40}
                    placeholder="M"
                    disabled={submittingProduct}
                    required
                  />
                  <label htmlFor={`variant-stock-${index}`}>Stock</label>
                  <input
                    id={`variant-stock-${index}`}
                    type="number"
                    min="0"
                    max="100000"
                    value={variant.stock}
                    onChange={(event) => updateVariant(index, 'stock', event.target.value)}
                    disabled={submittingProduct}
                    required
                  />
                  <button type="button" className="icon-button danger" onClick={() => removeVariant(index)} disabled={submittingProduct || variants.length <= 1} aria-label="Eliminar variante">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="vender-form-section">
            <div className="vender-section-heading">
              <div>
                <p className="vender-step-label">Imágenes</p>
                <p className="vender-help">Hasta 8 imágenes JPEG, PNG o WebP. La primera será la portada.</p>
              </div>
              <span className="image-count">{productImages.length}/8</span>
            </div>
            <div
              className="upload-box upload-box-interactive"
              onClick={() => { if (!submittingProduct) imageInputRef.current?.click() }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                if (!submittingProduct) addImages(event.dataTransfer.files)
              }}
              role="button"
              tabIndex={submittingProduct ? -1 : 0}
              onKeyDown={(event) => {
                if (!submittingProduct && (event.key === 'Enter' || event.key === ' ')) imageInputRef.current?.click()
              }}
            >
              <ImagePlus size={28} />
              <strong>Agrega fotos claras de tu producto</strong>
              <span>Haz clic o arrastra tus imágenes aquí</span>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                hidden
                onChange={(event) => {
                  addImages(event.target.files)
                  event.target.value = ''
                }}
                disabled={submittingProduct}
              />
            </div>
            {productImages.length > 0 && (
              <div className="image-preview-grid">
                {productImages.map((image, index) => (
                  <div className={`image-preview-card ${index === 0 ? 'cover' : ''}`} key={`${image.file.name}-${image.file.lastModified}-${index}`}>
                    <img src={image.preview} alt={`Vista previa ${index + 1}`} />
                    {index === 0 && <span className="cover-label"><Star size={12} /> Portada</span>}
                    <div className="image-preview-actions">
                      <button type="button" onClick={() => moveImage(index, -1)} disabled={submittingProduct || index === 0} aria-label="Mover imagen a la izquierda"><ArrowUp size={14} /></button>
                      <button type="button" onClick={() => moveImage(index, 1)} disabled={submittingProduct || index === productImages.length - 1} aria-label="Mover imagen a la derecha"><ArrowDown size={14} /></button>
                      <button type="button" onClick={() => removeImage(index)} disabled={submittingProduct} aria-label="Eliminar imagen"><X size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="vender-form-section vender-category-section">
            <label htmlFor="product-category">Categoría o etiqueta</label>
            <p className="vender-help">Este es el último campo porque ayuda a clasificar tu publicación.</p>
            <select
              id="product-category"
              value={product.categoryId}
              onChange={(event) => updateProduct('categoryId', event.target.value)}
              disabled={submittingProduct || categoriesLoading}
              required
            >
              <option value="">{categoriesLoading ? 'Cargando categorías...' : 'Selecciona una categoría'}</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </section>

          <div className="vender-actions">
            <Link className="btn-ghost" to="/panel-vendedor">Ir al panel</Link>
            <button className="btn-primary" type="submit" disabled={submittingProduct || categoriesLoading}>
              {submittingProduct ? 'Publicando imágenes...' : 'Publicar ahora'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function SellerApplicationForm({
  application,
  applicationError,
  applicationLoading,
  emailEdited,
  form,
  mensaje,
  setApplication,
  setApplicationError,
  setEmailEdited,
  setForm,
  setMensaje,
  setStep,
  step,
  submittingApplication,
  setSubmittingApplication,
  user,
}) {
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
                    <p>EcoBazar conecta tiendas de moda circular con compradores que buscan prendas con historia. Presenta tu negocio y llega a nuevos clientes desde un espacio pensado para vender mejor.</p>
                    <ul>
                      <li>Haz visible tu tienda frente a una comunidad interesada en consumo responsable.</li>
                      <li>Construye una presencia digital para tus prendas y tu propuesta.</li>
                      <li>Recibe acompañamiento durante la revisión de tu solicitud.</li>
                    </ul>
                    <div className="vender-actions"><button className="btn-primary" type="button" onClick={() => setStep(2)}>Continuar con mi solicitud</button></div>
                  </section>
                )}
                {step === 2 && (
                  <form className="vender-form" onSubmit={handleApplicationSubmit}>
                    <p className="vender-step-label">Cuéntanos sobre tu tienda o negocio</p>
                    <label htmlFor="seller-store-name">Nombre de la tienda</label>
                    <input id="seller-store-name" value={form.nombreTienda} onChange={(event) => setForm({ ...form, nombreTienda: event.target.value })} maxLength={180} required />
                    <label htmlFor="seller-phone">Teléfono de contacto</label>
                    <input id="seller-phone" type="tel" value={form.telefono} onChange={(event) => setForm({ ...form, telefono: event.target.value })} maxLength={30} required />
                    <label htmlFor="seller-email">Correo de contacto</label>
                    <input id="seller-email" type="email" value={emailEdited ? form.email : (form.email || user.email || '')} onChange={(event) => { setEmailEdited(true); setForm({ ...form, email: event.target.value }) }} maxLength={255} required />
                    <label htmlFor="seller-address">Dirección completa del negocio</label>
                    <input id="seller-address" value={form.direccion} onChange={(event) => setForm({ ...form, direccion: event.target.value })} maxLength={255} placeholder="Calle, número, colonia y referencias" required />
                    <label htmlFor="seller-description">Cuéntanos sobre tu negocio</label>
                    <textarea id="seller-description" value={form.descripcion} onChange={(event) => setForm({ ...form, descripcion: event.target.value })} maxLength={2000} placeholder="Qué vendes, desde cuándo y qué hace especial a tu tienda" required />
                    <div className="vender-actions">
                      <button className="btn-ghost" type="button" onClick={() => setStep(1)}>Volver</button>
                      <button className="btn-primary" type="submit" disabled={submittingApplication}>{submittingApplication ? 'Enviando...' : 'Enviar solicitud'}</button>
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
