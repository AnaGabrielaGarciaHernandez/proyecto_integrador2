import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Archive,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Check,
  Edit3,
  ImagePlus,
  Package,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react'
import { useAuth } from '../context/useAuth'
import {
  addSellerProductImages,
  deleteSellerProductImage,
  getCategories,
  getSellerPickupPoints,
  getSellerProducts,
  getSellerSales,
  reorderSellerProductImages,
  setSellerProductCover,
  updateSellerProduct,
  updateSellerProductStatus,
} from '../services/seller'
import '../styles/PanelVendedorScreen.css'

const PAGE_SIZE = 25
const STATUS_LABELS = {
  draft: 'Borrador',
  active: 'Activa',
  paused: 'Pausada',
  sold: 'Vendida',
  removed: 'Retirada',
}
const ORDER_STATUS_LABELS = {
  paid: 'Pagado',
  preparing: 'Preparando',
  ready_for_pickup: 'Lista para recoger',
  delivered: 'Entregado',
  pending_payment: 'Pendiente de pago',
  cancelled: 'Cancelado',
  refunded: 'Reembolsado',
}
const CONDITIONS = ['nuevo', 'como nuevo', 'buen estado', 'usado', 'muy usado']
const WEEK_DAYS = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
  { value: 7, label: 'Domingo' },
]

export default function PanelVendedorScreen() {
  const { user, loading: authLoading } = useAuth()
  const [products, setProducts] = useState([])
  const [productTotal, setProductTotal] = useState(0)
  const [productPagination, setProductPagination] = useState({ has_more: false })
  const [activeProductCount, setActiveProductCount] = useState(0)
  const [productSearch, setProductSearch] = useState('')
  const [productStatus, setProductStatus] = useState('')
  const [productOffset, setProductOffset] = useState(0)
  const [categories, setCategories] = useState([])
  const [pickupPoints, setPickupPoints] = useState([])
  const [pickupPointsLoading, setPickupPointsLoading] = useState(true)
  const [sales, setSales] = useState(null)
  const [salesSearch, setSalesSearch] = useState('')
  const [salesOffset, setSalesOffset] = useState(0)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [loading, setLoading] = useState(true)
  const [salesLoading, setSalesLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const imageInputRef = useRef(null)

  const loadProducts = useCallback(async () => {
    const data = await getSellerProducts({
      search: productSearch.trim(),
      status: productStatus,
      limit: PAGE_SIZE,
      offset: productOffset,
    })
    setProducts(data?.products || [])
    setProductTotal(Number(data?.total || 0))
    setProductPagination(data?.pagination || { has_more: false })
    const active = await getSellerProducts({ status: 'active', limit: 1, offset: 0 })
    setActiveProductCount(Number(active?.total || 0))
  }, [productOffset, productSearch, productStatus])

  const loadSales = useCallback(async () => {
    const data = await getSellerSales({
      search: salesSearch.trim(),
      limit: PAGE_SIZE,
      offset: salesOffset,
    })
    setSales(data)
  }, [salesOffset, salesSearch])

  useEffect(() => {
    if (authLoading || !user || user.role !== 'vendedor') return undefined
    let mounted = true
    const timeoutId = setTimeout(() => {
      setError('')
      loadProducts()
        .catch((err) => {
          if (mounted) setError(err.message || 'No pudimos cargar tus publicaciones.')
        })
        .finally(() => {
          if (mounted) setLoading(false)
        })
    }, 0)
    return () => {
      mounted = false
      clearTimeout(timeoutId)
    }
  }, [authLoading, loadProducts, user])

  useEffect(() => {
    if (authLoading || !user || user.role !== 'vendedor') return undefined
    let mounted = true
    const timeoutId = setTimeout(() => {
      loadSales()
        .catch((err) => {
          if (mounted) setError(err.message || 'No pudimos cargar tus ventas.')
        })
        .finally(() => {
          if (mounted) setSalesLoading(false)
        })
    }, 0)
    return () => {
      mounted = false
      clearTimeout(timeoutId)
    }
  }, [authLoading, loadSales, user])

  useEffect(() => {
    if (authLoading || !user || user.role !== 'vendedor') return undefined
    let mounted = true
    getCategories()
      .then((data) => {
        if (mounted) setCategories(data)
      })
      .catch(() => {})
    return () => { mounted = false }
  }, [authLoading, user])

  useEffect(() => {
    if (authLoading || !user || user.role !== 'vendedor') return undefined
    let mounted = true
    getSellerPickupPoints()
      .then((data) => { if (mounted) setPickupPoints(data) })
      .catch(() => {})
      .finally(() => { if (mounted) setPickupPointsLoading(false) })
    return () => { mounted = false }
  }, [authLoading, user])

  const activeProduct = useMemo(
    () => products.find((product) => product.id === selectedProduct?.id) || selectedProduct,
    [products, selectedProduct],
  )

  if (authLoading) return <div className="panel-vendedor-loading">Cargando...</div>
  if (!user) return <AccessMessage message="Inicia sesión para administrar tus publicaciones y ventas." />
  if (user.role !== 'vendedor') return <AccessMessage message="Solo las cuentas de vendedor pueden acceder a este panel." />

  function selectProduct(product) {
    setSelectedProduct(product)
    setEditForm(toEditForm(product))
  }

  function closeEditor() {
    setSelectedProduct(null)
    setEditForm(null)
  }

  function setFormField(field, value) {
    setEditForm((current) => ({ ...current, [field]: value }))
  }

  function updateEditVariant(index, field, value) {
    setEditForm((current) => ({
      ...current,
      variants: current.variants.map((variant, variantIndex) => (
        variantIndex === index ? { ...variant, [field]: value } : variant
      )),
    }))
  }

  function addEditVariant() {
    setEditForm((current) => ({
      ...current,
      variants: [...current.variants, { size_name: '', stock: 0 }],
    }))
  }

  function removeEditVariant(index) {
    setEditForm((current) => ({
      ...current,
      variants: current.variants.length <= 1
        ? current.variants
        : current.variants.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  function updateEditSchedule(index, field, value) {
    setEditForm((current) => ({
      ...current,
      pickup_schedules: current.pickup_schedules.map((schedule, scheduleIndex) => (
        scheduleIndex === index
          ? { ...schedule, [field]: field === 'day_of_week' ? Number(value) : value }
          : schedule
      )),
    }))
  }

  function addEditSchedule() {
    setEditForm((current) => ({
      ...current,
      pickup_schedules: [
        ...current.pickup_schedules,
        { day_of_week: 1, start_time: '10:00', end_time: '14:00' },
      ],
    }))
  }

  function removeEditSchedule(index) {
    setEditForm((current) => ({
      ...current,
      pickup_schedules: current.pickup_schedules.filter((_, scheduleIndex) => scheduleIndex !== index),
    }))
  }

  async function runAction(key, action, successMessage, refresh = true) {
    setBusy(key)
    setFeedback(null)
    try {
      await action()
      setFeedback({ type: 'success', message: successMessage })
      if (refresh) await Promise.all([loadProducts(), loadSales()])
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'No se pudo completar la acción.' })
    } finally {
      setBusy('')
    }
  }

  function handleStatus(product, status) {
    const label = status === 'removed' ? 'retirar' : status === 'paused' ? 'pausar' : 'reactivar'
    if (!window.confirm(`¿Quieres ${label} “${product.name}”?`)) return
    void runAction(
      `status-${product.id}`,
      () => updateSellerProductStatus(product.id, status),
      `Publicación ${status === 'removed' ? 'retirada' : status === 'paused' ? 'pausada' : 'reactivada'} correctamente.`,
    )
  }

  async function saveProduct(event) {
    event.preventDefault()
    if (!selectedProduct || !editForm) return
    await runAction(
      `edit-${selectedProduct.id}`,
      () => updateSellerProduct(selectedProduct.id, {
        name: editForm.name.trim(),
        description: editForm.description.trim(),
        condition: editForm.condition,
        price_mxn: editForm.price,
        category_id: editForm.category_id,
        pickup_point_id: editForm.pickup_point_id || null,
        pickup_schedules: editForm.pickup_schedules,
        variants: editForm.variants.map((variant) => ({
          id: variant.id,
          size_name: variant.size_name.trim(),
          stock: Number(variant.stock),
        })),
      }),
      'Publicación actualizada correctamente.',
    )
  }

  function addImages(event) {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!selectedProduct || files.length === 0) return
    const formData = new FormData()
    files.forEach((file) => formData.append('images', file, file.name))
    void runAction(
      `images-${selectedProduct.id}`,
      async () => {
        const data = await addSellerProductImages(selectedProduct.id, formData)
        if (data?.product) {
          setSelectedProduct(data.product)
          setEditForm(toEditForm(data.product))
        }
      },
      'Imágenes agregadas correctamente.',
    )
  }

  function handleImageDelete(product, image) {
    if (!window.confirm('¿Eliminar esta imagen de la publicación?')) return
    void runAction(
      `images-${product.id}`,
      async () => {
        const data = await deleteSellerProductImage(product.id, image.id)
        if (data?.product) {
          setSelectedProduct(data.product)
          setEditForm(toEditForm(data.product))
        }
      },
      'Imagen eliminada correctamente.',
    )
  }

  function handleCover(product, image) {
    void runAction(
      `images-${product.id}`,
      async () => {
        const data = await setSellerProductCover(product.id, image.id)
        if (data?.product) {
          setSelectedProduct(data.product)
          setEditForm(toEditForm(data.product))
        }
      },
      'Portada actualizada correctamente.',
    )
  }

  function handleImageOrder(product, index, direction) {
    const images = [...(product.images || [])]
    const target = index + direction
    if (target < 0 || target >= images.length) return
    const [image] = images.splice(index, 1)
    images.splice(target, 0, image)
    void runAction(
      `images-${product.id}`,
      async () => {
        const data = await reorderSellerProductImages(product.id, images.map((item) => item.id))
        if (data?.product) {
          setSelectedProduct(data.product)
          setEditForm(toEditForm(data.product))
        }
      },
      'Orden de imágenes actualizado.',
    )
  }

  const summary = sales?.summary || {}
  const productPage = Math.floor(productOffset / PAGE_SIZE) + 1
  const productPages = Math.max(1, Math.ceil(productTotal / PAGE_SIZE))
  const salesTotal = Number(sales?.total || 0)
  const salesPage = Math.floor(salesOffset / PAGE_SIZE) + 1
  const salesPages = Math.max(1, Math.ceil(salesTotal / PAGE_SIZE))

  return (
    <div className="panel-vendedor">
      <header className="panel-vendedor-hero">
        <div>
          <p className="panel-eyebrow">GESTIÓN DE TIENDA</p>
          <h1>Panel de vendedor</h1>
          <p>Administra tus publicaciones y consulta el rendimiento de tus ventas cobradas.</p>
        </div>
        <Link className="panel-publish-link" to="/vender"><Plus size={16} /> Nueva publicación</Link>
      </header>

      <main className="panel-vendedor-body">
        {feedback && <div className={`panel-feedback ${feedback.type}`} role={feedback.type === 'error' ? 'alert' : 'status'}>{feedback.message}</div>}
        {error && <div className="panel-feedback error" role="alert">{error}</div>}

        <section className="seller-metrics" aria-label="Resumen de ventas">
          <Metric icon={<BarChart3 size={18} />} label="Ventas cobradas" value={formatMoney(summary.total_sales_cents)} />
          <Metric icon={<ShoppingBag size={18} />} label="Pedidos cobrados" value={summary.paid_orders_count || 0} />
          <Metric icon={<Package size={18} />} label="Unidades vendidas" value={summary.units_sold || 0} />
          <Metric icon={<Archive size={18} />} label="Productos activos" value={activeProductCount} />
        </section>

        <section className="seller-section seller-sales-section">
          <div className="seller-section-header">
            <div><h2>Ventas por producto</h2><p>Solo incluye pedidos cobrados y no reembolsados.</p></div>
            <span className="seller-muted">Canceladas: {summary.cancelled_orders_count || 0} · Reembolsadas: {summary.refunded_orders_count || 0}</span>
          </div>
          <div className="product-sales-list">
            {(sales?.product_sales || []).map((item) => (
              <div className="product-sales-row" key={`${item.product_id}-${item.product_name}`}>
                <div><strong>{item.product_name || 'Producto eliminado'}</strong><span>{item.units_sold} unidades</span></div>
                <strong>{formatMoney(item.sales_cents)}</strong>
              </div>
            ))}
            {!salesLoading && (sales?.product_sales || []).length === 0 && <p className="seller-empty">Todavía no hay ventas cobradas.</p>}
          </div>
        </section>

        <section className="seller-section">
          <div className="seller-section-header"><div><h2>Mis publicaciones</h2><p>{productTotal} publicaciones encontradas.</p></div></div>
          <div className="seller-toolbar">
            <label className="seller-search"><Search size={16} /><input value={productSearch} onChange={(event) => { setProductSearch(event.target.value); setProductOffset(0) }} placeholder="Buscar por nombre" /></label>
            <select value={productStatus} onChange={(event) => { setProductStatus(event.target.value); setProductOffset(0) }} aria-label="Filtrar publicaciones por estado">
              <option value="">Todos los estados</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button className="seller-icon-action" onClick={() => void runAction('reload-products', loadProducts, 'Publicaciones actualizadas.')} disabled={loading || Boolean(busy)} title="Actualizar"><RefreshCw size={16} /></button>
          </div>
          {loading && <p className="seller-loading">Cargando publicaciones...</p>}
          {!loading && products.length === 0 && <p className="seller-empty">No hay publicaciones con estos filtros.</p>}
          <div className="seller-products-list">
            {products.map((item) => (
              <SellerProductRow
                key={item.id}
                product={item}
                busy={busy}
                onEdit={() => selectProduct(item)}
                onStatus={handleStatus}
              />
            ))}
          </div>
          <Pagination current={productPage} pages={productPages} previous={() => setProductOffset(Math.max(0, productOffset - PAGE_SIZE))} next={() => setProductOffset(productOffset + PAGE_SIZE)} previousDisabled={productOffset === 0 || loading} nextDisabled={!productPagination.has_more || loading} />
        </section>

        {activeProduct && editForm && (
          <section className="seller-section seller-editor" aria-label="Editar publicación">
            <div className="seller-section-header"><div><h2>Editar publicación</h2><p>Los cambios se guardan en el backend antes de cerrar este editor.</p></div><button className="seller-close" onClick={closeEditor} aria-label="Cerrar editor"><X size={18} /></button></div>
            <form className="seller-edit-form" onSubmit={saveProduct}>
              <label>Nombre<input value={editForm.name} onChange={(event) => setFormField('name', event.target.value)} maxLength={180} disabled={Boolean(busy)} required /></label>
              <label>Descripción<textarea value={editForm.description} onChange={(event) => setFormField('description', event.target.value)} maxLength={5000} disabled={Boolean(busy)} required /></label>
              <label>Condición<select value={editForm.condition} onChange={(event) => setFormField('condition', event.target.value)} disabled={Boolean(busy)}>{CONDITIONS.map((condition) => <option key={condition} value={condition}>{condition}</option>)}</select></label>
              <label>Precio (MXN)<input type="number" min="0.01" step="0.01" value={editForm.price} onChange={(event) => setFormField('price', event.target.value)} disabled={Boolean(busy)} required /></label>
              <label>Categoría<select value={editForm.category_id} onChange={(event) => setFormField('category_id', event.target.value)} disabled={Boolean(busy)}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
              <label>Punto de venta<select value={editForm.pickup_point_id} onChange={(event) => setFormField('pickup_point_id', event.target.value)} disabled={Boolean(busy) || pickupPointsLoading} required><option value="">Selecciona un punto activo</option>{pickupPoints.filter((point) => point.is_active).map((point) => <option key={point.id} value={point.id}>{point.name} · {point.city}, {point.state}</option>)}</select></label>
              <div className="edit-pickup-schedules"><div className="edit-label-row"><span>Horarios de recogida</span><button type="button" onClick={addEditSchedule} disabled={Boolean(busy)}><Plus size={14} /> Agregar</button></div>{editForm.pickup_schedules.map((schedule, index) => <div className="edit-pickup-schedule-row" key={`${index}-${schedule.day_of_week}-${schedule.start_time}`}><select aria-label={`Día del horario de edición ${index + 1}`} value={schedule.day_of_week} onChange={(event) => updateEditSchedule(index, 'day_of_week', event.target.value)} disabled={Boolean(busy)}>{WEEK_DAYS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}</select><input type="time" value={schedule.start_time} onChange={(event) => updateEditSchedule(index, 'start_time', event.target.value)} disabled={Boolean(busy)} required /><input type="time" value={schedule.end_time} onChange={(event) => updateEditSchedule(index, 'end_time', event.target.value)} disabled={Boolean(busy)} required /><button type="button" onClick={() => removeEditSchedule(index)} disabled={Boolean(busy)} aria-label="Eliminar horario"><Trash2 size={15} /></button></div>)}</div>
              <div className="edit-variants"><div className="edit-label-row"><span>Variantes y stock</span><button type="button" onClick={addEditVariant} disabled={Boolean(busy)}><Plus size={14} /> Agregar</button></div>{editForm.variants.map((variant, index) => <div className="edit-variant-row" key={variant.id || `new-${index}`}><input value={variant.size_name} onChange={(event) => updateEditVariant(index, 'size_name', event.target.value)} placeholder="Talla" disabled={Boolean(busy)} required /><input type="number" min="0" value={variant.stock} onChange={(event) => updateEditVariant(index, 'stock', event.target.value)} placeholder="Stock" disabled={Boolean(busy)} required /><button type="button" onClick={() => removeEditVariant(index)} disabled={Boolean(busy) || editForm.variants.length <= 1} aria-label="Eliminar variante"><Trash2 size={15} /></button></div>)}</div>
              <button className="panel-save-button" type="submit" disabled={Boolean(busy)}>{busy === `edit-${activeProduct.id}` ? 'Guardando...' : <><Check size={16} /> Guardar cambios</>}</button>
            </form>

            <div className="seller-image-manager"><div className="edit-label-row"><div><h3>Imágenes</h3><p>La estrella indica la portada. Puedes reordenar y retirar imágenes.</p></div><button type="button" onClick={() => imageInputRef.current?.click()} disabled={Boolean(busy) || activeProduct.status === 'removed'}><ImagePlus size={15} /> Agregar imágenes</button><input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={addImages} /></div><div className="managed-images">{(activeProduct.images || []).map((image, index) => <div className={`managed-image ${image.is_cover ? 'is-cover' : ''}`} key={image.id}><img src={image.url} alt={`Imagen ${index + 1} de ${activeProduct.name}`} /><div className="managed-image-actions"><button type="button" onClick={() => handleImageOrder(activeProduct, index, -1)} disabled={Boolean(busy) || index === 0} aria-label="Subir imagen"><ArrowUp size={14} /></button><button type="button" onClick={() => handleImageOrder(activeProduct, index, 1)} disabled={Boolean(busy) || index === (activeProduct.images || []).length - 1} aria-label="Bajar imagen"><ArrowDown size={14} /></button><button type="button" onClick={() => handleCover(activeProduct, image)} disabled={Boolean(busy) || image.is_cover} aria-label="Elegir portada"><StarIcon active={image.is_cover} /></button><button type="button" onClick={() => handleImageDelete(activeProduct, image)} disabled={Boolean(busy) || (activeProduct.images || []).length <= 1} aria-label="Eliminar imagen"><Trash2 size={14} /></button></div></div>)}</div></div>
          </section>
        )}

        <section className="seller-section seller-history-section">
          <div className="seller-section-header"><div><h2>Historial de ventas</h2><p>Consulta el pedido, comprador, productos y total que te corresponde.</p></div></div>
          <div className="seller-toolbar"><label className="seller-search"><Search size={16} /><input value={salesSearch} onChange={(event) => { setSalesSearch(event.target.value); setSalesOffset(0) }} placeholder="Pedido, comprador o producto" /></label></div>
          {salesLoading && <p className="seller-loading">Cargando ventas...</p>}
          {!salesLoading && (sales?.orders || []).length === 0 && <p className="seller-empty">No hay movimientos para esta búsqueda.</p>}
          <div className="seller-orders-list">{(sales?.orders || []).map((order) => <SellerOrderRow key={order.id} order={order} />)}</div>
          <Pagination current={salesPage} pages={salesPages} previous={() => setSalesOffset(Math.max(0, salesOffset - PAGE_SIZE))} next={() => setSalesOffset(salesOffset + PAGE_SIZE)} previousDisabled={salesOffset === 0 || salesLoading} nextDisabled={!sales?.pagination?.has_more || salesLoading} />
        </section>
      </main>
    </div>
  )
}

function SellerProductRow({ product, busy, onEdit, onStatus }) {
  const pickupIncomplete = product.pickup_configuration_status !== 'complete'
  return (
    <article className="seller-product-row">
      <img className="seller-product-thumb" src={product.images?.[0]?.url || ''} alt="" />
      <div className="seller-product-main"><div className="seller-product-title"><h3>{product.name}</h3><span className={`seller-status seller-status-${product.status}`}>{STATUS_LABELS[product.status] || product.status}</span>{pickupIncomplete && <span className="seller-status seller-status-pickup">Recogida pendiente</span>}</div><p>{product.category?.name || 'Sin categoría'} · {product.variants?.length || 0} variantes · {Number(product.total_stock || 0)} unidades</p><small className="seller-product-pickup">{product.pickup_point?.name || 'Sin punto de venta'} · {(product.pickup_schedules || []).length} horario(s)</small><strong>{formatMoney(product.price_cents)}</strong></div>
      <div className="seller-product-actions"><button onClick={onEdit} disabled={Boolean(busy)}><Edit3 size={14} /> Editar</button>{product.status === 'active' && <button onClick={() => onStatus(product, 'paused')} disabled={Boolean(busy)}><Pause size={14} /> Pausar</button>}{product.status === 'paused' && <button onClick={() => onStatus(product, 'active')} disabled={Boolean(busy)}><Play size={14} /> Reactivar</button>}{product.status !== 'removed' && <button className="danger-action" onClick={() => onStatus(product, 'removed')} disabled={Boolean(busy)}><Trash2 size={14} /> Retirar</button>}</div>
    </article>
  )
}

function SellerOrderRow({ order }) {
  return <article className="seller-order-row"><div className="seller-order-head"><div><strong>{order.order_number || order.id}</strong><span>{formatDate(order.created_at)} · {order.buyer_name || 'Comprador'}</span></div><div className="seller-order-total">{formatMoney(order.seller_total_cents)}<span className={`seller-status seller-status-${order.status}`}>{ORDER_STATUS_LABELS[order.status] || order.status}</span></div></div><div className="seller-order-items">{(order.items || []).map((item) => <span key={item.id}>{item.product_name} · {item.quantity} × {formatMoney(item.unit_price_cents)}</span>)}</div></article>
}

function Metric({ icon, label, value }) {
  return <div className="seller-metric"><span className="seller-metric-icon">{icon}</span><span><small>{label}</small><strong>{value}</strong></span></div>
}

function Pagination({ current, pages, previous, next, previousDisabled, nextDisabled }) {
  return <div className="seller-pagination"><button onClick={previous} disabled={previousDisabled}>Anterior</button><span>Página {current} de {pages}</span><button onClick={next} disabled={nextDisabled}>Siguiente</button></div>
}

function AccessMessage({ message }) {
  return <div className="panel-vendedor-access"><AlertIcon /><h2>Acceso restringido</h2><p>{message}</p><Link className="btn-primary" to="/">Volver al inicio</Link></div>
}

function AlertIcon() {
  return <span className="panel-access-icon">!</span>
}

function StarIcon({ active }) {
  return <span className={active ? 'star-action active' : 'star-action'}>★</span>
}

function toEditForm(product) {
  return {
    name: product.name || '',
    description: product.description || '',
    condition: product.condition || 'buen estado',
    price: (Number(product.price_cents || 0) / 100).toFixed(2),
    category_id: product.category?.id || '',
    pickup_point_id: product.pickup_point?.id || product.pickup_point_id || '',
    pickup_schedules: (product.pickup_schedules || []).map((schedule) => ({
      id: schedule.id,
      day_of_week: Number(schedule.day_of_week),
      start_time: schedule.start_time,
      end_time: schedule.end_time,
    })),
    variants: (product.variants || []).map((variant) => ({
      id: variant.id,
      size_name: variant.size_name,
      stock: Number(variant.stock || 0),
    })),
  }
}

function formatMoney(cents) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(cents || 0) / 100)
}

function formatDate(value) {
  if (!value) return 'Fecha no disponible'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : date.toLocaleDateString('es-MX')
}
