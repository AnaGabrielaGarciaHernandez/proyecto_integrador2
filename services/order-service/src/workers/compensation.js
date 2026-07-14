function startCompensationWorker({ orders, checkoutService, paymentClient, intervalMs = 5000 }) {
  let running = false;
  let stopped = false;

  async function tick() {
    if (running || stopped) return;
    running = true;
    try {
      if (paymentClient && typeof orders.listExpiredPendingCheckouts === 'function') {
        await reconcileExpiredCheckouts({ orders, checkoutService, paymentClient });
      }
      const pending = await orders.listPendingCompensations();
      for (const saga of pending) {
        try {
          await checkoutService.compensate(saga.id, {
            correlationId: saga.correlation_id,
            reason: saga.last_error || 'Retry pending compensation',
          });
        } catch (error) {
          console.error(`[order-service] correlation_id=${saga.correlation_id} event_type=order.cancelled.v1 step=compensation_retry_failed order_id=${saga.id}`, error);
        }
      }
    } catch (error) {
      console.error('[order-service] correlation_id=unknown event_type=order.cancelled.v1 step=compensation_worker_failed', error);
    } finally {
      running = false;
    }
  }

  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  tick();
  return async function stop() {
    stopped = true;
    clearInterval(timer);
    while (running) await new Promise((resolve) => setTimeout(resolve, 10));
  };
}

async function reconcileExpiredCheckouts({ orders, checkoutService, paymentClient }) {
  const expired = await orders.listExpiredPendingCheckouts();
  for (const candidate of expired) {
    try {
      await reconcileExpiredCheckout(candidate, { orders, checkoutService, paymentClient });
    } catch (error) {
      console.error(`[order-service] correlation_id=${candidate.correlation_id} event_type=payment.checkout.expired.v1 step=expired_checkout_compensation_failed order_id=${candidate.id}`, error);
    }
  }
}

async function reconcileExpiredCheckout(candidate, { orders, checkoutService, paymentClient }) {
  const correlationId = candidate.correlation_id;
  const current = await orders.getSagaOrder(candidate.id);
  if (!current || current.status !== 'pending_payment'
    || !['created', 'inventory_reserved', 'payment_session_created'].includes(current.saga_status)) {
    return;
  }

  if (current.saga_status === 'created') {
    // Payment is never called before the saga leaves `created`. Catalog release
    // is still idempotent in case reserve succeeded just before a crash.
    await checkoutService.compensate(candidate.id, {
      correlationId,
      reason: 'Checkout expired before payment creation',
      paymentStatus: 'cancelled',
    });
    console.log(`[order-service] correlation_id=${correlationId} event_type=order.cancelled.v1 step=expired_checkout_before_payment order_id=${candidate.id}`);
    return;
  }

  if (current.saga_status === 'inventory_reserved') {
    let recovered;
    try {
      // sessions.create may have succeeded while its response or local update
      // failed. Repeating the exact order-keyed request recovers it safely.
      recovered = await paymentClient.createCheckout(
        buildPaymentCheckoutRequest(current),
        correlationId,
      );
    } catch (error) {
      console.error(`[order-service] correlation_id=${correlationId} event_type=payment.checkout.expired.v1 step=expired_checkout_recovery_failed order_id=${candidate.id}`, error);
      return;
    }
    if (recovered.payment?.status === 'succeeded' || recovered.checkout?.status === 'complete') {
      console.log(`[order-service] correlation_id=${correlationId} event_type=payment.checkout.completed.v1 step=expired_checkout_payment_complete order_id=${candidate.id}`);
      return;
    }
    if (['cancelled', 'failed'].includes(recovered.payment?.status)) {
      await compensateConfirmedExpired(candidate, recovered, checkoutService);
      return;
    }
    // An already-expired recovered Session is safe, but still call Payment's
    // idempotent expire command so its local status/outbox are reconciled before
    // Catalog stock is released.
    if (!['open', 'expired'].includes(recovered.checkout?.status)) {
      console.error(`[order-service] correlation_id=${correlationId} event_type=payment.checkout.expired.v1 step=expired_checkout_recovery_ambiguous order_id=${candidate.id}`);
      return;
    }
  }

  let response;
  try {
    response = await paymentClient.expire(candidate.id, correlationId);
  } catch (error) {
    // Even 404 is ambiguous once Payment creation may have started: Order can
    // hold a session id or Stripe may have accepted a request whose local save
    // was lost. Keep stock reserved and retry instead of risking overselling.
    console.error(`[order-service] correlation_id=${correlationId} event_type=payment.checkout.expired.v1 step=expired_checkout_reconcile_failed order_id=${candidate.id}`, error);
    return;
  }

  if (response.payment?.status === 'succeeded' || response.checkout?.status === 'complete') {
    console.log(`[order-service] correlation_id=${correlationId} event_type=payment.checkout.completed.v1 step=expired_checkout_payment_complete order_id=${candidate.id}`);
    return;
  }
  if (!isConfirmedWithoutCharge(response)) {
    console.error(`[order-service] correlation_id=${correlationId} event_type=payment.checkout.expired.v1 step=expired_checkout_ambiguous order_id=${candidate.id}`);
    return;
  }

  await compensateConfirmedExpired(candidate, response, checkoutService);
}

async function compensateConfirmedExpired(candidate, response, checkoutService) {
  await checkoutService.compensate(candidate.id, {
    correlationId: candidate.correlation_id,
    reason: 'Stripe checkout expired',
    paymentStatus: response.payment?.status === 'failed' ? 'failed' : 'cancelled',
  });
  console.log(`[order-service] correlation_id=${candidate.correlation_id} event_type=order.cancelled.v1 step=expired_checkout_compensated order_id=${candidate.id}`);
}

function buildPaymentCheckoutRequest(order) {
  return {
    order_id: order.id,
    order_number: order.order_number,
    buyer_id: order.buyer_id,
    amount_cents: order.total_cents,
    currency: order.currency,
    expires_at: order.checkout_expires_at instanceof Date
      ? order.checkout_expires_at.toISOString()
      : new Date(order.checkout_expires_at).toISOString(),
    items: order.items.map((item) => ({
      product_name: item.product_name,
      size_name: item.size_name,
      quantity: item.quantity,
      unit_price_cents: item.unit_price_cents,
    })),
  };
}

function isConfirmedWithoutCharge(response) {
  return ['cancelled', 'failed'].includes(response.payment?.status)
    || ['expired', 'cancelled'].includes(response.checkout?.status);
}

module.exports = {
  startCompensationWorker,
  reconcileExpiredCheckouts,
  isConfirmedWithoutCharge,
};
