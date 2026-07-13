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
  const [state, setState] = useState(orderId ? 'cancelling' : 'done')
  const [error, setError] = useState(orderId ? '' : 'No se recibió un identificador de pedido válido.')

  useEffect(() => {
    let active = true
    if (!orderId) {
      return () => { active = false }
    }
    cancelarCheckout(orderId)
      .then(() => { if (active) setState('done') })
      .catch((err) => {
        if (active) {
          setState('done')
          setError(err.message || 'No se pudo cancelar la reserva.')
        }
      })
    return () => { active = false }
  }, [orderId])

  return (
    <div className="checkout-status-page">
      <section className="checkout-status-card">
        <XCircle className="checkout-status-icon cancelled" size={60} />
        <h1>{state === 'cancelling' ? 'Cancelando pago...' : 'Pago cancelado'}</h1>
        <p>{state === 'cancelling' ? 'Estamos liberando la reserva de tus productos.' : 'No se realizó ningún cargo. Tus productos siguen en el carrito, sujetos a disponibilidad.'}</p>
        {error && <div className="checkout-status-error">{error}</div>}
        <Link to="/carrito" className="checkout-status-primary">Regresar al carrito</Link>
        <Link to="/explorar" className="checkout-status-secondary">Seguir explorando</Link>
      </section>
    </div>
  )
}
