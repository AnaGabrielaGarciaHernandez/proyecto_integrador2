import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Users, CheckCircle, XCircle, Trash2, Shield, Activity, BarChart, X
} from 'lucide-react'
import { get, patch, post, del } from '../services/api'
import '../styles/AdminScreen.css'

const USERS_PAGE_SIZE = 25

const ORDER_STATUS_CONFIG = {
  paid: { label: 'Pagado', className: 'status-pagado' },
  preparing: { label: 'Preparando', className: 'status-preparando' },
  ready_for_pickup: { label: 'Listo para recoger', className: 'status-listo' },
  delivered: { label: 'Entregado', className: 'status-entregado' },
  pending_payment: { label: 'Pendiente', className: 'status-pendiente' },
  cancelled: { label: 'Cancelado', className: 'status-cancelado' },
  refunded: { label: 'Reembolsado', className: 'status-reembolsado' },
}

export default function AdminScreen() {
  const location = useLocation()
  const navigate = useNavigate()

  const tab = location.pathname.includes('solicitudes')
    ? 'solicitudes'
    : location.pathname.includes('reportes')
    ? 'reportes'
    : 'usuarios'

  const [users, setUsers] = useState([])
  const [applications, setApplications] = useState([])
  const [reports, setReports] = useState(null)
  const [userSearch, setUserSearch] = useState('')
  const [userOffset, setUserOffset] = useState(0)
  const [userPagination, setUserPagination] = useState({
    limit: USERS_PAGE_SIZE,
    offset: 0,
    has_more: false,
    total: 0,
  })
  const [reportSearch, setReportSearch] = useState('')
  const [reportOffset, setReportOffset] = useState(0)
  const [reportPagination, setReportPagination] = useState({
    limit: USERS_PAGE_SIZE,
    offset: 0,
    has_more: false,
    total: 0,
  })
  const [selectedMovement, setSelectedMovement] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [pendingUserActions, setPendingUserActions] = useState(() => new Set())
  const [pendingApplicationActions, setPendingApplicationActions] = useState(() => new Set())
  const requestIdRef = useRef(0)

  const fetchData = useCallback(async ({ search = '', offset = 0 } = {}) => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setLoading(true)
    setError('')

    try {
      if (tab === 'usuarios') {
        const params = new URLSearchParams({
          search,
          limit: String(USERS_PAGE_SIZE),
          offset: String(offset),
        })
        const data = await get(`/admin/users?${params.toString()}`)
        if (requestId !== requestIdRef.current) return false
        setUsers(data?.users || [])
        const pagination = data?.pagination || {}
        setUserPagination({
          limit: Number(pagination.limit) || USERS_PAGE_SIZE,
          offset: Number(pagination.offset) || offset,
          has_more: Boolean(pagination.has_more),
          total: Number(data?.total) || 0,
        })
      } else if (tab === 'solicitudes') {
        const data = await get('/admin/seller-applications')
        if (requestId !== requestIdRef.current) return false
        setApplications(data?.applications || [])
      } else if (tab === 'reportes') {
        const params = new URLSearchParams({
          search,
          limit: String(USERS_PAGE_SIZE),
          offset: String(offset),
        })
        const data = await get(`/admin/reports/sales?${params.toString()}`)
        if (requestId !== requestIdRef.current) return false
        setReports(data || null)
        const pagination = data?.pagination || {}
        setReportPagination({
          limit: Number(pagination.limit) || USERS_PAGE_SIZE,
          offset: Number(pagination.offset) || offset,
          has_more: Boolean(pagination.has_more),
          total: Number(data?.total) || 0,
        })
        setSelectedMovement(null)
      }
      return true
    } catch (err) {
      if (requestId !== requestIdRef.current) return false
      setError(err.message || 'Error al cargar los datos')
      return false
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [tab])

  useEffect(() => {
    if (tab !== 'usuarios' && tab !== 'reportes') {
      queueMicrotask(() => {
        void fetchData()
      })
      return undefined
    }

    const isUsersTab = tab === 'usuarios'
    const timeoutId = setTimeout(() => {
      void fetchData({
        search: (isUsersTab ? userSearch : reportSearch).trim(),
        offset: isUsersTab ? userOffset : reportOffset,
      })
    }, 300)
    return () => clearTimeout(timeoutId)
  }, [fetchData, reportOffset, reportSearch, tab, userOffset, userSearch])

  function setActionPending(setter, id, pending) {
    setter((current) => {
      const next = new Set(current)
      if (pending) next.add(id)
      else next.delete(id)
      return next
    })
  }

  async function runUserAction(id, action, successMessage) {
    setActionPending(setPendingUserActions, id, true)
    setFeedback(null)
    try {
      await action()
      setFeedback({ type: 'success', message: successMessage })
      await fetchData({ search: userSearch.trim(), offset: userOffset })
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.message || 'No se pudo completar la acción.',
      })
    } finally {
      setActionPending(setPendingUserActions, id, false)
    }
  }

  async function runApplicationAction(id, action, successMessage) {
    setActionPending(setPendingApplicationActions, id, true)
    setFeedback(null)
    try {
      await action()
      setFeedback({ type: 'success', message: successMessage })
      await fetchData()
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.message || 'No se pudo completar la acción.',
      })
    } finally {
      setActionPending(setPendingApplicationActions, id, false)
    }
  }

  function handleSearchChange(event) {
    setUserSearch(event.target.value)
    setUserOffset(0)
  }

  function handleReportSearchChange(event) {
    setReportSearch(event.target.value)
    setReportOffset(0)
    setSelectedMovement(null)
  }

  function handleSuspendUser(user) {
    if (!window.confirm(`¿Estás seguro de ${user.is_active ? 'suspender' : 'activar'} a este usuario?`)) return
    void runUserAction(
      user.id,
      () => patch(`/admin/users/${user.id}/suspend`, { is_active: !user.is_active }),
      user.is_active ? 'Usuario suspendido correctamente' : 'Usuario activado correctamente',
    )
  }

  function handleDeleteUser(id) {
    if (!window.confirm('¿Solicitar la eliminación y anonimización de este usuario?')) return
    void runUserAction(
      id,
      () => del(`/admin/users/${id}`),
      'Solicitud de eliminación enviada',
    )
  }

  function handleChangeRole(id, currentRole) {
    const newRole = window.prompt('Escribe el nuevo rol (cliente, vendedor, admin):', currentRole)
    if (!newRole || newRole === currentRole) return
    void runUserAction(
      id,
      () => patch(`/admin/users/${id}/role`, { role: newRole }),
      'Rol actualizado correctamente',
    )
  }

  function handleApproveApp(id) {
    if (!window.confirm('¿Aprobar solicitud? El usuario se convertirá en vendedor.')) return
    void runApplicationAction(
      id,
      () => post(`/admin/seller-applications/${id}/approve`),
      'Solicitud aprobada correctamente',
    )
  }

  function handleRejectApp(id) {
    const reason = window.prompt('Motivo de rechazo:')
    if (reason === null) return
    void runApplicationAction(
      id,
      () => post(`/admin/seller-applications/${id}/reject`, { reason }),
      'Solicitud rechazada correctamente',
    )
  }

  const pendientesCount = applications.length
  const currentPage = Math.floor(userOffset / USERS_PAGE_SIZE) + 1
  const hasPreviousPage = userOffset > 0
  const hasNextPage = userPagination.has_more
  const reportCurrentPage = Math.floor(reportOffset / USERS_PAGE_SIZE) + 1
  const reportHasPreviousPage = reportOffset > 0
  const reportHasNextPage = reportPagination.has_more

  return (
    <div>
      <div className="admin-hero">
        <h1>Panel de Administración</h1>
      </div>

      <div className="admin-tabs">
        <button className={`admin-tab ${tab === 'usuarios' ? 'activo' : ''}`} onClick={() => navigate('/admin/usuarios')}>
          <Users size={14} /> Usuarios
        </button>
        <button className={`admin-tab ${tab === 'solicitudes' ? 'activo' : ''}`} onClick={() => navigate('/admin/solicitudes')}>
          <Shield size={14} /> Solicitudes
          {pendientesCount > 0 && <span className="admin-badge">{pendientesCount}</span>}
        </button>
        <button className={`admin-tab ${tab === 'reportes' ? 'activo' : ''}`} onClick={() => navigate('/admin/reportes')}>
          <Activity size={14} /> Reportes
        </button>
      </div>

      <div className="admin-body">
        {feedback && (
          <p className={`admin-feedback ${feedback.type}`} role={feedback.type === 'success' ? 'status' : 'alert'}>
            {feedback.message}
          </p>
        )}
        {loading && <p>Cargando información...</p>}
        {error && <p className="admin-error" role="alert">{error}</p>}

        {(!error || tab === 'usuarios' || tab === 'reportes') && (
          <>
            {tab === 'usuarios' && (
              <div>
                <div className="admin-users-toolbar">
                  <label htmlFor="admin-user-search">Buscar usuarios</label>
                  <input
                    id="admin-user-search"
                    type="search"
                    value={userSearch}
                    onChange={handleSearchChange}
                    placeholder="Nombre o correo"
                  />
                </div>

                {users.map((user) => {
                  const deletionPending = Boolean(user.deletion_requested_at && !user.deleted_at)
                  const actionPending = pendingUserActions.has(user.id)
                  const disabled = deletionPending || actionPending

                  return (
                    <div key={user.id} className="admin-card">
                      <div className="admin-user-row">
                        <div>
                          <h3>{user.full_name} <span className="admin-user-role">({user.role})</span></h3>
                          <p>{user.email}</p>
                          {deletionPending ? (
                            <span className="status-badge status-pendiente">Eliminación pendiente</span>
                          ) : (
                            <span className={`status-badge ${user.is_active ? 'status-aprobado' : 'status-rechazado'}`}>
                              {user.is_active ? 'Activo' : 'Suspendido'}
                            </span>
                          )}
                        </div>
                        <div className="admin-acciones-grid admin-user-actions">
                          <button
                            className="admin-btn admin-btn-nota"
                            onClick={() => handleChangeRole(user.id, user.role)}
                            disabled={disabled}
                          >
                            Cambiar Rol
                          </button>
                          <button
                            className="admin-btn admin-btn-suspender"
                            onClick={() => handleSuspendUser(user)}
                            disabled={disabled}
                          >
                            {user.is_active ? 'Suspender' : 'Activar'}
                          </button>
                          <button
                            className="admin-btn admin-btn-rechazar"
                            onClick={() => handleDeleteUser(user.id)}
                            disabled={disabled}
                          >
                            <Trash2 size={15} /> Borrar
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {users.length === 0 && <p>No hay usuarios registrados.</p>}

                <div className="admin-pagination" aria-label="Paginación de usuarios">
                  <button
                    className="admin-btn admin-btn-nota"
                    onClick={() => setUserOffset(Math.max(0, userOffset - USERS_PAGE_SIZE))}
                    disabled={!hasPreviousPage || loading}
                  >
                    Anterior
                  </button>
                  <span>Página {currentPage} de {Math.max(1, Math.ceil(userPagination.total / USERS_PAGE_SIZE))}</span>
                  <button
                    className="admin-btn admin-btn-nota"
                    onClick={() => setUserOffset(userOffset + USERS_PAGE_SIZE)}
                    disabled={!hasNextPage || loading}
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}

            {tab === 'solicitudes' && (
              <div>
                {applications.map((application) => {
                  const actionPending = pendingApplicationActions.has(application.id)
                  return (
                    <div key={application.id} className="admin-card">
                      <div style={{ padding: '16px' }}>
                        <h3>{application.requested_display_name} <span className="admin-user-role">({formatSellerType(application.seller_type)})</span></h3>
                        <p><strong>Descripción:</strong> {application.description}</p>
                        <p><strong>Teléfono:</strong> {application.contact_phone}</p>
                        <p><strong>Correo:</strong> {application.contact_email || '—'}</p>
                        <p><strong>Dirección:</strong> {application.contact_address || '—'}</p>
                        <div className="admin-acciones-grid" style={{ marginTop: '16px' }}>
                          <button className="admin-btn admin-btn-aprobar" onClick={() => handleApproveApp(application.id)} disabled={actionPending}>
                            <CheckCircle size={15} /> Aprobar
                          </button>
                          <button className="admin-btn admin-btn-rechazar" onClick={() => handleRejectApp(application.id)} disabled={actionPending}>
                            <XCircle size={15} /> Rechazar
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {applications.length === 0 && <p>No hay solicitudes pendientes.</p>}
              </div>
            )}

            {tab === 'reportes' && (
              <div>
                <div className="admin-report-toolbar">
                  <label htmlFor="admin-sales-search">Buscar movimientos</label>
                  <input
                    id="admin-sales-search"
                    type="search"
                    value={reportSearch}
                    onChange={handleReportSearchChange}
                    placeholder="Pedido, nombre o ID de usuario/vendedor"
                  />
                </div>

                {reports && (
                  <>
                    <div className="admin-card admin-sales-summary">
                      <BarChart size={48} color="var(--color-accent)" style={{ marginBottom: '16px' }} />
                      <h2>Total de ventas cobradas</h2>
                      <p className="admin-sales-total">
                        {formatMoney(reports.total_sales_cents)}
                      </p>
                      <div className="admin-sales-context">
                        <span><strong>{Number(reports.paid_orders_count || 0)}</strong> pedidos cobrados</span>
                        <span><strong>{Number(reports.cancelled_orders_count || 0)}</strong> cancelados</span>
                      </div>
                    </div>

                    <div className="admin-reportes-titulo admin-movement-heading">
                      <h3>Todos los movimientos</h3>
                      <span>{reportPagination.total} encontrados</span>
                    </div>

                    {reports.movements?.map((movement) => {
                      const status = getOrderStatus(movement)
                      const payment = getPaymentStatus(movement.payment_status)
                      return (
                        <button
                          key={movement.id}
                          type="button"
                          className="admin-card admin-movement-card admin-movement-button"
                          onClick={() => setSelectedMovement(movement)}
                        >
                          <div className="admin-movement-main">
                            <strong>{movement.order_number}</strong>
                            <p>{movement.buyer_name || 'Cliente'}</p>
                            <small title={movement.id}>ID: {shortId(movement.id)}</small>
                            <small>
                              Vendedor(es): {formatSellerNames(movement.sellers)}
                            </small>
                          </div>
                          <div className="admin-movement-meta">
                            <div className="admin-status-group">
                              <span className={`status-badge ${status.className}`}>{status.label}</span>
                              <span className={`status-badge ${payment.className}`}>{payment.label}</span>
                            </div>
                            <p>{formatMoney(movement.total_cents, movement.currency)}</p>
                            <small>{Number(movement.item_count || 0)} artículo(s) · {formatDate(movement.created_at)}</small>
                          </div>
                        </button>
                      )
                    })}
                    {(!reports.movements || reports.movements.length === 0) && <p>No hay movimientos que coincidan con la búsqueda.</p>}

                    <div className="admin-pagination" aria-label="Paginación de movimientos">
                      <button
                        className="admin-btn admin-btn-nota"
                        onClick={() => {
                          setReportOffset(Math.max(0, reportOffset - USERS_PAGE_SIZE))
                          setSelectedMovement(null)
                        }}
                        disabled={!reportHasPreviousPage || loading}
                      >
                        Anterior
                      </button>
                      <span>Página {reportCurrentPage} de {Math.max(1, Math.ceil(reportPagination.total / USERS_PAGE_SIZE))}</span>
                      <button
                        className="admin-btn admin-btn-nota"
                        onClick={() => {
                          setReportOffset(reportOffset + USERS_PAGE_SIZE)
                          setSelectedMovement(null)
                        }}
                        disabled={!reportHasNextPage || loading}
                      >
                        Siguiente
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {selectedMovement && (
        <MovementModal
          movement={selectedMovement}
          onClose={() => setSelectedMovement(null)}
        />
      )}
    </div>
  )
}

function MovementModal({ movement, onClose }) {
  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  const status = getOrderStatus(movement)
  const payment = getPaymentStatus(movement.payment_status)

  return (
    <div
      className="admin-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="movement-modal-title">
        <button type="button" className="admin-modal-close" onClick={onClose} aria-label="Cerrar detalle">
          <X size={20} />
        </button>
        <div className="admin-modal-header">
          <div>
            <h2 id="movement-modal-title">Detalle de {movement.order_number}</h2>
            <p title={movement.id}>ID: {movement.id}</p>
          </div>
          <div className="admin-status-group">
            <span className={`status-badge ${status.className}`}>{status.label}</span>
            <span className={`status-badge ${payment.className}`}>{payment.label}</span>
          </div>
        </div>

        <div className="admin-modal-details">
          <div><span>Comprador</span><strong>{movement.buyer_name || 'Cliente'}</strong></div>
          <div><span>ID del comprador</span><strong>{movement.buyer_id}</strong></div>
          <div><span>Creado</span><strong>{formatDate(movement.created_at)}</strong></div>
          <div><span>Pagado</span><strong>{formatDate(movement.paid_at)}</strong></div>
          <div><span>Cancelado</span><strong>{formatDate(movement.cancelled_at)}</strong></div>
          <div><span>Recolección</span><strong>{formatDate(movement.pickup_scheduled_at)}</strong></div>
          <div><span>Subtotal</span><strong>{formatMoney(movement.subtotal_cents, movement.currency)}</strong></div>
          <div><span>Total</span><strong>{formatMoney(movement.total_cents, movement.currency)}</strong></div>
        </div>

        <h3>Vendedores</h3>
        <div className="admin-modal-sellers">
          {movement.sellers?.length > 0 ? movement.sellers.map((seller) => (
            <p key={seller.user_id}>
              {seller.name || 'Nombre no disponible'} · ID: {seller.user_id}
            </p>
          )) : <p>No hay vendedor asociado.</p>}
        </div>

        <h3>Artículos</h3>
        <div className="admin-modal-items">
          {movement.items?.map((item) => (
            <div className="admin-modal-item" key={item.id}>
              <div>
                <strong>{item.product_name}</strong>
                <span>{item.size_name} · {item.seller_name || 'Vendedor no disponible'}</span>
                <small title={item.seller_user_id}>ID vendedor: {item.seller_user_id || '—'}</small>
              </div>
              <div>
                <span>{item.quantity} × {formatMoney(item.unit_price_cents, movement.currency)}</span>
                <strong>{formatMoney(item.total_cents, movement.currency)}</strong>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function formatMoney(cents, currency = 'MXN') {
  return `$${(Number(cents || 0) / 100).toFixed(2)} ${currency || 'MXN'}`
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
}

function shortId(value) {
  if (!value) return '—'
  return `${String(value).slice(0, 8)}…`
}

function formatSellerNames(sellers) {
  if (!sellers?.length) return 'No disponible'
  return sellers.map((seller) => seller.name || shortId(seller.user_id)).join(', ')
}

function formatSellerType(type) {
  return { store: 'Tienda o negocio', person: 'Persona física', bazar: 'Bazar' }[type] || type || 'Sin tipo'
}

function getPaymentStatus(paymentStatus) {
  const config = {
    succeeded: { label: 'Cobrado', className: 'status-pagado' },
    pending: { label: 'Pago pendiente', className: 'status-pendiente' },
    requires_action: { label: 'Requiere acción', className: 'status-pendiente' },
    failed: { label: 'Pago fallido', className: 'status-cancelado' },
    cancelled: { label: 'Pago cancelado', className: 'status-cancelado' },
    refunded: { label: 'Reembolsado', className: 'status-reembolsado' },
  }
  return config[paymentStatus] || { label: paymentStatus || 'Sin pago', className: 'status-resuelto' }
}

function getOrderStatus(order) {
  const statusKey = order.payment_status === 'refunded' ? 'refunded' : order.status
  return ORDER_STATUS_CONFIG[statusKey] || {
    label: statusKey || 'Sin estado',
    className: 'status-resuelto',
  }
}
