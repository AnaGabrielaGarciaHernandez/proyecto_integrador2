import { useEffect, useState } from 'react'
import { useAuth } from '../context/useAuth'
import { getOrdersForUser } from '../services/orders'
import '../styles/OrdersScreen.css'

export default function OrdersScreen() {
  const { user, loading } = useAuth()
  const [orders, setOrders] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    if (!loading) {
      getOrdersForUser(user)
        .then((list) => { if (mounted) setOrders(list) })
        .catch(() => { if (mounted) setError('Error cargando pedidos') })
    }
    return () => { mounted = false }
  }, [user, loading])

  if (loading) return <div style={{ padding: 24 }}>Cargando...</div>

  if (!user) return (
    <div style={{ padding: 24 }}>Inicia sesión para ver tus pedidos.</div>
  )

  return (
    <div className="orders-container">
      <div className="orders-hero">
        <h2>Mis pedidos</h2>
        <p className="orders-sub">Sigue el estado y detalles</p>
      </div>

      <div className="orders-body">
        {error && <div className="orders-error">{error}</div>}

        {orders.length === 0 && (
          <div className="orders-empty">No hay pedidos recientes.</div>
        )}

        {orders.map((o) => (
          <div key={o.id} className="order-row">
            <div className="order-left">
              <div className="order-id">#{o.id}</div>
              <div className="order-date">{o.date}</div>
              <div className="order-items">{o.items.map(i => i.name).join(', ')}</div>
            </div>

            <div className="order-right">
              <div className={`order-status order-status--${o.status.replace(/\s+/g,'').toLowerCase()}`}>{o.status}</div>
              <div className="order-total">$ {o.total}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
