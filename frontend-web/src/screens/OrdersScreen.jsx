import { useEffect, useState } from 'react'
import { AlertTriangle, CalendarDays, Clock, MapPin } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { getOrdersForUser } from '../services/orders'
import '../styles/OrdersScreen.css'

export default function OrdersScreen() {
  const { user, loading } = useAuth()
  const [orders, setOrders] = useState([])
  const [error, setError] = useState('')
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    let mounted = true
    if (!loading) {
      getOrdersForUser(user)
        .then((list) => { if (mounted) setOrders(list) })
        .catch(() => { if (mounted) setError('No se pudieron cargar los pedidos.') })
        .finally(() => { if (mounted) setFetching(false) })
    }
    return () => { mounted = false }
  }, [user, loading])

  if (loading) return <div className="orders-message">Cargando...</div>

  if (!user) return (
    <div className="orders-message">Inicia sesión para ver tus pedidos.</div>
  )

  return (
    <div className="orders-container">
      <div className="orders-hero">
        <h2>{user.role === 'vendedor' ? 'Mis ventas' : 'Mis pedidos'}</h2>
        <p className="orders-sub">{user.role === 'vendedor' ? 'Consulta tus ventas y artículos' : 'Sigue el estado de tus compras'}</p>
      </div>

      <div className="orders-body">
        {error && <div className="orders-error">{error}</div>}

        {fetching && <div className="orders-empty">Cargando pedidos...</div>}

        {!fetching && !error && orders.length === 0 && (
          <div className="orders-empty">No hay pedidos recientes.</div>
        )}

        {!fetching && orders.map((o) => (
          <div key={o.id} className="order-row">
            <div className="order-left">
              <div className="order-id">{o.order_number}</div>
              <div className="order-date">{formatDate(o.created_at)}</div>
              {user.role === 'vendedor' && o.buyer_name && <div className="order-buyer">Comprador: {o.buyer_name}</div>}
              <div className="order-items">
                {o.items.map((item) => (
                  <span key={item.id}>{item.quantity} × {item.product_name} · {item.size_name}</span>
                ))}
              </div>
              {user.role !== 'vendedor' && o.pickup_groups?.length > 0 && (
                <div className="pickup-groups" aria-label="Datos de recogida">
                  <h3><MapPin size={16} /> Recogida de tu pedido</h3>
                  {o.pickup_groups.map((group) => <PickupGroupCard key={group.id} group={group} />)}
                </div>
              )}
            </div>

            <div className="order-right">
              <div className={`order-status order-status--${o.status}`}>{STATUS_LABELS[o.status] || o.status}</div>
              <div className="order-total">{formatMoney(user.role === 'vendedor' ? o.seller_total_cents : o.total_cents, o.currency)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PickupGroupCard({ group }) {
  const expired = group.status === 'expired'
  return (
    <article className={`pickup-order-card ${expired ? 'pickup-order-card--expired' : ''}`}>
      <div className="pickup-order-card-head">
        <div><strong>{group.point?.name || 'Punto de recogida'}</strong><span>Vendedor: {group.seller_name || 'Vendedor'}</span></div>
        <span className={`pickup-order-status ${expired ? 'expired' : 'scheduled'}`}>{expired ? 'Recogida vencida' : 'Programada'}</span>
      </div>
      <p className="pickup-order-address">{group.point?.address_line}, {group.point?.city}, {group.point?.state}, C.P. {group.point?.postal_code}</p>
      {group.point?.reference && <p className="pickup-order-reference">Referencia: {group.point.reference}</p>}
      <div className="pickup-order-times">
        <span><CalendarDays size={14} /> {formatPickupDate(group.scheduled_start_at)}</span>
        <span><Clock size={14} /> {formatPickupTime(group.scheduled_start_at)} – {formatPickupTime(group.scheduled_end_at)}</span>
      </div>
      <p className="pickup-order-deadline"><AlertTriangle size={14} /> Fecha límite: {formatPickupDateTime(group.deadline_at)}</p>
      <div className="pickup-order-items">{(group.items || []).map((item) => <span key={item.id}>{item.quantity} × {item.product_name} · {item.size_name}</span>)}</div>
    </article>
  )
}

const STATUS_LABELS = {
  pending_payment: 'Pendiente de pago',
  paid: 'Pagado',
  preparing: 'Preparando',
  ready_for_pickup: 'Listo para recoger',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
  refunded: 'Reembolsado',
}

function formatMoney(cents, currency = 'MXN') {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format((cents || 0) / 100)
}

function formatDate(date) {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date))
}

function formatPickupDate(value) {
  return formatPickup(value, { dateStyle: 'long' })
}

function formatPickupDateTime(value) {
  return formatPickup(value, { dateStyle: 'medium', timeStyle: 'short' })
}

function formatPickupTime(value) {
  return formatPickup(value, { timeStyle: 'short' })
}

function formatPickup(value, options) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible'
  return new Intl.DateTimeFormat('es-MX', { ...options, timeZone: 'America/Monterrey' }).format(date)
}
