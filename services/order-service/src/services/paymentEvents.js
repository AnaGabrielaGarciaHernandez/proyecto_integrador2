const { EVENT_TYPES } = require('@ecobazar/contracts');
const { createEvent, insertOutbox } = require('@ecobazar/platform');

const FAILURE_EVENTS = new Set([
  EVENT_TYPES.PAYMENT_FAILED,
  EVENT_TYPES.PAYMENT_EXPIRED,
  EVENT_TYPES.PAYMENT_CANCELLED,
]);

function createPaymentEventHandler({ orders, catalogClient }) {
  return async function handlePaymentEvent({ event, client }) {
    const orderId = event.payload.order_id;
    if (!orderId) return;

    if (event.event_type === EVENT_TYPES.PAYMENT_COMPLETED) {
      const result = await orders.transitionPaid(orderId, event.payload, client);
      if (!result.order || !result.transitioned) return;
      if (event.payload.buyer_id && event.payload.buyer_id !== result.order.buyer_id) {
        throw new Error('Payment buyer does not match order buyer');
      }
      const paidEvent = createEvent({
        eventType: EVENT_TYPES.ORDER_PAID,
        producer: 'order-service',
        correlationId: event.correlation_id,
        causationId: event.event_id,
        payload: {
          order_id: result.order.id,
          buyer_id: result.order.buyer_id,
          items: result.order.items.map(({ variant_id, quantity }) => ({ variant_id, quantity })),
        },
      });
      await insertOutbox(client, paidEvent);
      console.log(`[order-service] correlation_id=${event.correlation_id} event_type=${event.event_type} step=order_paid order_id=${orderId}`);
      return;
    }

    if (!FAILURE_EVENTS.has(event.event_type)) return;
    const order = await orders.getSagaOrder(orderId, client);
    if (!order || order.status !== 'pending_payment') return;
    if (event.payload.buyer_id && event.payload.buyer_id !== order.buyer_id) {
      throw new Error('Payment buyer does not match order buyer');
    }

    const reason = event.payload.failure_message || event.event_type;
    await orders.stageCompensation(orderId, reason, event.correlation_id, client);
    try {
      const reservation = await catalogClient.release(orderId, event.correlation_id);
      if (reservation && !['released', 'expired', 'cancelled'].includes(reservation.status)) {
        throw new Error(`Inventory reservation is ${reservation.status}`);
      }
      const result = await orders.finishCompensation(orderId, {
        correlationId: event.correlation_id,
        causationId: event.event_id,
        paymentStatus: event.event_type === EVENT_TYPES.PAYMENT_FAILED ? 'failed' : 'cancelled',
        reason,
      }, client);
      if (result?.transitioned) {
        const cancelled = await orders.getSagaOrder(orderId, client);
        const cancelledEvent = createEvent({
          eventType: EVENT_TYPES.ORDER_CANCELLED,
          producer: 'order-service',
          correlationId: event.correlation_id,
          causationId: event.event_id,
          payload: {
            order_id: cancelled.id,
            buyer_id: cancelled.buyer_id,
            reason,
            items: cancelled.items.map(({ variant_id, quantity }) => ({ variant_id, quantity })),
          },
        });
        await insertOutbox(client, cancelledEvent);
      }
      console.log(`[order-service] correlation_id=${event.correlation_id} event_type=${event.event_type} step=inventory_released order_id=${orderId}`);
    } catch (error) {
      await client.query(
        `UPDATE checkout_sagas SET status = 'compensation_pending', last_error = $2,
         updated_at = now() WHERE order_id = $1 AND status <> 'paid'`,
        [orderId, `${reason}: ${error.message}`],
      );
      console.error(`[order-service] correlation_id=${event.correlation_id} event_type=${event.event_type} step=inventory_release_failed order_id=${orderId}`, error);
    }
  };
}

module.exports = { createPaymentEventHandler };
