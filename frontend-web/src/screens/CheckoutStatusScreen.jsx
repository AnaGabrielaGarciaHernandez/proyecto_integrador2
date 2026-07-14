import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Clock3, XCircle } from 'lucide-react'
import { cancelarCheckout } from '../services/checkout'
import { getOrder } from '../services/orders'
import '../styles/CheckoutStatusScreen.css'

const MAX_POLLS = 10

export function CheckoutSuccessScreen() {
  const [params] = useSearchParams()
  const orderId = params.get('order_id')
  const [order, setOrder] = useState(null)
  const [error, setError] = useState('')
  const [finishedPolling, setFinishedPolling] = useState(false)

  useEffect(() => {
    let active = true
    let timeout
    let attempts = 0

    async function poll() {
      if (!orderId) {
        setError('No se recibió un identificador de pedido válido.')
        return
      }
      try {
        const nextOrder = await getOrder(orderId)
        if (!active) return
        setOrder(nextOrder)
        if (nextOrder.status === 'paid' || nextOrder.status !== 'pending_payment') {
          if (nextOrder.status === 'paid') window.dispatchEvent(new Event('carritoActualizado'))
          setFinishedPolling(true)
          return
        }
        attempts += 1
        if (attempts < MAX_POLLS) timeout = window.setTimeout(poll, 1500)
        else setFinishedPolling(true)
      } catch (err) {
        if (active) setError(err.message || 'No se pudo consultar el pedido.')
      }
    }

    poll()
    return () => {
      active = false
      window.clearTimeout(timeout)
    }
  }, [orderId])

  const paid = order?.status === 'paid'
  return (
    <div className="checkout-status-page">
      <section className="checkout-status-card">
        {paid ? <CheckCircle2 className="checkout-status-icon success" size={60} /> : <Clock3 className="checkout-status-icon pending" size={60} />}
        <h1>{paid ? 'Pago confirmado' : 'Confirmando tu pago'}</h1>
        <p>
          {paid
            ? `Tu pedido ${order.order_number} quedó registrado. Te avisaremos cuando esté listo para recoger.`
            : finishedPolling
              ? 'La confirmación está tardando un poco. Tu pedido se actualizará automáticamente cuando Stripe confirme el pago.'
              : 'Recibimos tu regreso de Stripe. Estamos esperando la confirmación segura del pago.'}
        </p>
        {error && <div className="checkout-status-error">{error}</div>}
        <Link to="/pedidos" className="checkout-status-primary">Ver mis pedidos</Link>
        <Link to="/explorar" className="checkout-status-secondary">Seguir explorando</Link>
      </section>
    </div>
  )
}

export function CheckoutCancelledScreen() {
  const [params] = useSearchParams()
  const orderId = params.get('order_id')
  const [state, setState] = useState(orderId ? 'cancelling' : 'error')
  const [error, setError] = useState(orderId ? '' : 'No se recibió un identificador de pedido válido.')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    if (!orderId) {
      return () => { active = false }
    }
    cancelarCheckout(orderId)
      .then((order) => {
        if (!active) return
        if (order?.status === 'cancelled') {
          setState('cancelled')
          return
        }
        if (order?.status === 'paid') {
          setState('paid')
          return
        }
        setState('error')
        setError('Stripe todavía no confirma la cancelación. La reserva permanece protegida; inténtalo nuevamente.')
      })
      .catch((err) => {
        if (active) {
          setState('error')
          setError(err.message || 'No se pudo confirmar la cancelación. El pago podría seguir abierto.')
        }
      })
    return () => { active = false }
  }, [orderId, attempt])

  const isCancelling = state === 'cancelling'
  const isCancelled = state === 'cancelled'
  const isPaid = state === 'paid'

  return (
    <div className="checkout-status-page">
      <section className="checkout-status-card">
        {isPaid
          ? <CheckCircle2 className="checkout-status-icon success" size={60} />
          : isCancelled
            ? <XCircle className="checkout-status-icon cancelled" size={60} />
            : <Clock3 className="checkout-status-icon pending" size={60} />}
        <h1>{isCancelling ? 'Cancelando pago...' : isCancelled ? 'Pago cancelado' : isPaid ? 'Pago confirmado' : 'Cancelación pendiente'}</h1>
        <p>
          {isCancelling
            ? 'Estamos confirmando la cancelación con Stripe antes de liberar la reserva.'
            : isCancelled
              ? 'No se realizó ningún cargo. Tus productos siguen en el carrito, sujetos a disponibilidad.'
              : isPaid
                ? 'Stripe ya había confirmado el cobro. Consulta el estado de tu pedido.'
                : 'No podemos asegurar todavía que la sesión de pago esté cancelada. No vuelvas a pagar y reintenta la cancelación.'}
        </p>
        {error && <div className="checkout-status-error">{error}</div>}
        {state === 'error' && orderId && (
          <button
            type="button"
            className="checkout-status-primary"
            onClick={() => {
              setState('cancelling')
              setError('')
              setAttempt((value) => value + 1)
            }}
          >
            Reintentar cancelación
          </button>
        )}
        {isCancelled && <Link to="/carrito" className="checkout-status-primary">Regresar al carrito</Link>}
        {isPaid && <Link to="/pedidos" className="checkout-status-primary">Ver mi pedido</Link>}
        <Link to="/explorar" className="checkout-status-secondary">Seguir explorando</Link>
      </section>
    </div>
  )
}
