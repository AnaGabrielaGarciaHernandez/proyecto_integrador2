const { EVENT_TYPES } = require('@ecobazar/contracts');
const { createEvent, insertOutbox } = require('@ecobazar/platform');

function createPaymentsRepository(db) {
  async function createOrGet(request, correlationId) {
    return db.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [request.order_id]);
      const existing = await client.query(
        'SELECT * FROM payments WHERE order_id = $1 FOR UPDATE',
        [request.order_id],
      );
      if (existing.rows[0]) return normalizePayment(existing.rows[0]);
      const result = await client.query(
        `INSERT INTO payments
           (order_id, buyer_id, correlation_id, amount_cents, currency, checkout_expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [request.order_id, request.buyer_id, correlationId,
          request.amount_cents, request.currency.toUpperCase(), request.expires_at],
      );
      return normalizePayment(result.rows[0]);
    });
  }

  async function getByOrder(orderId) {
    const result = await db.query('SELECT * FROM payments WHERE order_id = $1', [orderId]);
    return result.rows[0] ? normalizePayment(result.rows[0]) : null;
  }

  async function saveSession(orderId, session) {
    const result = await db.query(
      `UPDATE payments
       SET stripe_checkout_session_id = $2, stripe_checkout_url = $3,
           checkout_expires_at = to_timestamp($4), updated_at = now()
       WHERE order_id = $1
       RETURNING *`,
      [orderId, session.id, session.url, session.expires_at],
    );
    return normalizePayment(result.rows[0]);
  }

  async function markCreationFailed(orderId, correlationId, error) {
    return db.transaction(async (client) => {
      const transition = await client.query(
        `UPDATE payments
         SET status = 'failed', failure_code = $2, failure_message = $3, updated_at = now()
         WHERE order_id = $1 AND status = 'pending'
         RETURNING *`,
        [orderId, error.code || error.type || 'stripe_error', error.message],
      );
      if (!transition.rows[0]) return null;
      const payment = normalizePayment(transition.rows[0]);
      await emitPaymentEvent(client, EVENT_TYPES.PAYMENT_FAILED, payment, correlationId, null, {
        failure_code: payment.failure_code,
        failure_message: payment.failure_message,
      });
      return payment;
    });
  }

  async function markCancelled(orderId, correlationId, rawEvent = null) {
    return db.transaction(async (client) => {
      const transition = await client.query(
        `UPDATE payments
         SET status = 'cancelled', raw_event = COALESCE($2::jsonb, raw_event), updated_at = now()
         WHERE order_id = $1 AND status IN ('pending', 'requires_action')
         RETURNING *`,
        [orderId, rawEvent ? JSON.stringify(rawEvent) : null],
      );
      const current = transition.rows[0] || (await client.query(
        'SELECT * FROM payments WHERE order_id = $1', [orderId],
      )).rows[0];
      if (transition.rows[0]) {
        await emitPaymentEvent(
          client,
          EVENT_TYPES.PAYMENT_CANCELLED,
          normalizePayment(current),
          correlationId,
          null,
        );
      }
      return current ? normalizePayment(current) : null;
    });
  }

  async function processStripeEvent(event, details, correlationId) {
    return db.transaction(async (client) => {
      const session = event.data.object;
      const orderId = session.metadata?.order_id;
      const accepted = await client.query(
        `INSERT INTO stripe_events (event_id, event_type, order_id, raw_event)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
        [event.id, event.type, orderId || null, JSON.stringify(event)],
      );
      if (!accepted.rows[0]) return { duplicate: true, processed: false };
      if (!orderId) return { duplicate: false, processed: false };

      const locked = await client.query(
        'SELECT * FROM payments WHERE order_id = $1 FOR UPDATE',
        [orderId],
      );
      const payment = locked.rows[0];
      if (!payment) return { duplicate: false, processed: false };
      if (session.metadata?.buyer_id && session.metadata.buyer_id !== payment.buyer_id) {
        throw new Error('Stripe session buyer does not match payment buyer');
      }

      if (event.type === 'checkout.session.completed' && session.payment_status === 'paid') {
        const transition = await client.query(
          `UPDATE payments
           SET status = 'succeeded',
               stripe_checkout_session_id = COALESCE($2, stripe_checkout_session_id),
               stripe_payment_intent_id = COALESCE($3, stripe_payment_intent_id),
               stripe_charge_id = COALESCE($4, stripe_charge_id),
               stripe_receipt_url = COALESCE($5, stripe_receipt_url),
               raw_event = $6::jsonb, updated_at = now()
           WHERE order_id = $1 AND status IN ('pending', 'requires_action')
           RETURNING *`,
          [orderId, session.id, details.intent_id || null, details.charge_id || null,
            details.receipt_url || null, JSON.stringify(event)],
        );
        if (transition.rows[0]) {
          await emitPaymentEvent(
            client,
            EVENT_TYPES.PAYMENT_COMPLETED,
            normalizePayment(transition.rows[0]),
            correlationId,
            null,
            { receipt_url: details.receipt_url || null },
          );
        }
        return { duplicate: false, processed: true };
      }

      if (event.type === 'checkout.session.expired') {
        const transition = await client.query(
          `UPDATE payments SET status = 'cancelled', raw_event = $2::jsonb, updated_at = now()
           WHERE order_id = $1 AND status IN ('pending', 'requires_action') RETURNING *`,
          [orderId, JSON.stringify(event)],
        );
        if (transition.rows[0]) {
          await emitPaymentEvent(
            client,
            EVENT_TYPES.PAYMENT_EXPIRED,
            normalizePayment(transition.rows[0]),
            correlationId,
            null,
          );
        }
        return { duplicate: false, processed: Boolean(transition.rows[0]) };
      }

      if (event.type === 'checkout.session.async_payment_failed') {
        const transition = await client.query(
          `UPDATE payments
           SET status = 'failed', failure_code = $2, failure_message = $3,
               raw_event = $4::jsonb, updated_at = now()
           WHERE order_id = $1 AND status IN ('pending', 'requires_action') RETURNING *`,
          [orderId, details.failure_code || 'payment_failed',
            details.failure_message || 'Stripe payment failed', JSON.stringify(event)],
        );
        if (transition.rows[0]) {
          await emitPaymentEvent(
            client,
            EVENT_TYPES.PAYMENT_FAILED,
            normalizePayment(transition.rows[0]),
            correlationId,
            null,
            { failure_code: details.failure_code, failure_message: details.failure_message },
          );
        }
        return { duplicate: false, processed: Boolean(transition.rows[0]) };
      }
      return { duplicate: false, processed: false };
    });
  }

  return {
    createOrGet,
    getByOrder,
    saveSession,
    markCreationFailed,
    markCancelled,
    processStripeEvent,
  };
}

async function emitPaymentEvent(client, eventType, payment, correlationId, causationId, extra = {}) {
  const event = createEvent({
    eventType,
    producer: 'payment-service',
    correlationId,
    causationId,
    payload: {
      order_id: payment.order_id,
      buyer_id: payment.buyer_id,
      payment_id: payment.id,
      payment_status: payment.status,
      stripe_checkout_session_id: payment.stripe_checkout_session_id,
      ...extra,
    },
  });
  await insertOutbox(client, event);
  console.log(`[payment-service] correlation_id=${correlationId} event_type=${eventType} step=outbox_created order_id=${payment.order_id}`);
  return event;
}

function normalizePayment(row) {
  return row ? { ...row, amount_cents: Number(row.amount_cents) } : null;
}

module.exports = { createPaymentsRepository };
