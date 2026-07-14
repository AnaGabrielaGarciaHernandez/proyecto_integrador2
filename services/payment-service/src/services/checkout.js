const { PaymentCheckoutRequestSchema } = require('@ecobazar/contracts');
const { createHttpError } = require('@ecobazar/platform');

function createPaymentCheckoutService({ payments, stripeProvider, clientOrigin }) {
  async function createCheckout(input, correlationId) {
    const request = PaymentCheckoutRequestSchema.parse(input);
    const stripe = stripeProvider();
    let payment = await payments.createOrGet(request, correlationId);
    verifyPaymentMatches(payment, request);

    if (payment.stripe_checkout_session_id) {
      const existing = await retrieveSession(stripe, payment.stripe_checkout_session_id);
      if (existing.status === 'open' && existing.url) {
        console.log(`[payment-service] correlation_id=${correlationId} event_type=payment.checkout.requested step=checkout_reused order_id=${request.order_id}`);
        return response(payment, existing);
      }
      if (existing.status === 'complete') {
        return response(payment, existing);
      }
      payment = await payments.markCancelled(request.order_id, correlationId);
      return response(payment, existing);
    }

    if (!['pending', 'requires_action'].includes(payment.status)) {
      return {
        payment: publicPayment(payment),
        checkout: {
          order_id: request.order_id,
          session_id: null,
          url: null,
          status: 'expired',
          expires_at: payment.checkout_expires_at
            ? new Date(payment.checkout_expires_at).toISOString()
            : null,
        },
      };
    }

    let session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: request.items.map((item) => ({
          quantity: item.quantity,
          price_data: {
            currency: request.currency.toLowerCase(),
            unit_amount: item.unit_price_cents,
            product_data: { name: `${item.product_name} · ${item.size_name}` },
          },
        })),
        metadata: {
          order_id: request.order_id,
          buyer_id: request.buyer_id,
          correlation_id: correlationId,
        },
        payment_intent_data: {
          metadata: {
            order_id: request.order_id,
            buyer_id: request.buyer_id,
            correlation_id: correlationId,
          },
        },
        success_url: `${clientOrigin.replace(/\/$/, '')}/checkout/exito?order_id=${request.order_id}`,
        cancel_url: `${clientOrigin.replace(/\/$/, '')}/checkout/cancelado?order_id=${request.order_id}`,
        expires_at: Math.floor(new Date(request.expires_at).getTime() / 1000),
      }, { idempotencyKey: `checkout-${request.order_id}` });
    } catch (error) {
      if (isAmbiguousStripeError(error)) {
        // The idempotency key lets a later retry recover a Session that Stripe
        // may have created before the connection was interrupted. Do not emit a
        // failure or release stock until the outcome is known.
        throw stripeStateUncertain(error, request.order_id);
      }
      await payments.markCreationFailed(request.order_id, correlationId, error).catch((dbError) => {
        console.error(`[payment-service] correlation_id=${correlationId} event_type=payment.checkout.failed.v1 step=failure_persist_failed order_id=${request.order_id}`, dbError);
      });
      throw stripeUnavailable(error);
    }

    payment = await payments.saveSession(request.order_id, session);
    console.log(`[payment-service] correlation_id=${correlationId} event_type=payment.checkout.requested step=stripe_session_created order_id=${request.order_id}`);
    return response(payment, session);
  }

  async function expireCheckout(orderId, correlationId) {
    const stripe = stripeProvider();
    let payment = await payments.getByOrder(orderId);
    if (!payment) throw createHttpError('Payment not found', 404);
    if (payment.status === 'succeeded') {
      return { payment: publicPayment(payment), checkout: { status: 'complete' } };
    }

    if (['failed', 'cancelled'].includes(payment.status)) {
      return {
        payment: publicPayment(payment),
        checkout: { order_id: orderId, status: 'expired', url: null },
      };
    }

    // A pending payment without a persisted Session can be the result of a
    // connection loss after Stripe accepted sessions.create. Marking it as
    // cancelled would release inventory while that unknown Session could still
    // charge. The caller must first replay createCheckout with the order's
    // idempotency key so Payment can recover and then expire the Session.
    if (!payment.stripe_checkout_session_id) {
      throw stripeStateUncertain(undefined, orderId);
    }

    let session = null;
    session = await retrieveSession(stripe, payment.stripe_checkout_session_id);
    if (session.status === 'complete') {
      return { payment: publicPayment(payment), checkout: publicCheckout(session, orderId) };
    }
    if (session.status === 'open') {
      try {
        session = await stripe.checkout.sessions.expire(payment.stripe_checkout_session_id);
      } catch (error) {
        const latest = await retrieveSession(stripe, payment.stripe_checkout_session_id);
        if (latest.status === 'complete') {
          return { payment: publicPayment(payment), checkout: publicCheckout(latest, orderId) };
        }
        throw stripeUnavailable(error);
      }
    }
    payment = await payments.markCancelled(orderId, correlationId);
    console.log(`[payment-service] correlation_id=${correlationId} event_type=payment.checkout.cancelled.v1 step=stripe_session_expired order_id=${orderId}`);
    return {
      payment: publicPayment(payment),
      checkout: session ? publicCheckout(session, orderId) : { order_id: orderId, status: 'expired' },
    };
  }

  return { createCheckout, expireCheckout };
}

async function retrieveSession(stripe, sessionId) {
  try {
    return await stripe.checkout.sessions.retrieve(sessionId);
  } catch (error) {
    throw stripeStateUncertain(error);
  }
}

function isAmbiguousStripeError(error) {
  return !error?.type || ['StripeConnectionError', 'StripeAPIError'].includes(error.type);
}

function verifyPaymentMatches(payment, request) {
  if (payment.buyer_id !== request.buyer_id
    || payment.amount_cents !== request.amount_cents
    || payment.currency.toUpperCase() !== request.currency.toUpperCase()) {
    throw createHttpError('Checkout request does not match the existing payment', 409, {
      code: 'CHECKOUT_IN_PROGRESS', order_id: request.order_id,
    });
  }
}

function response(payment, session) {
  return {
    payment: publicPayment(payment),
    checkout: publicCheckout(session, payment.order_id),
  };
}

function publicPayment(payment) {
  return {
    id: payment.id,
    order_id: payment.order_id,
    status: payment.status,
    amount_cents: payment.amount_cents,
    currency: payment.currency,
    receipt_url: payment.stripe_receipt_url || null,
  };
}

function publicCheckout(session, orderId) {
  return {
    order_id: orderId,
    session_id: session.id,
    url: session.url || null,
    status: session.status,
    expires_at: session.expires_at
      ? new Date(session.expires_at * 1000).toISOString()
      : null,
  };
}

function stripeUnavailable(cause) {
  const error = createHttpError('Stripe is temporarily unavailable', 503, { code: 'STRIPE_UNAVAILABLE' });
  error.cause = cause;
  return error;
}

function stripeStateUncertain(cause, orderId) {
  const error = createHttpError('Stripe checkout state is still being confirmed', 503, {
    code: 'CHECKOUT_IN_PROGRESS',
    ...(orderId ? { order_id: orderId } : {}),
  });
  error.cause = cause;
  return error;
}

module.exports = {
  createPaymentCheckoutService,
  verifyPaymentMatches,
  publicPayment,
  publicCheckout,
  isAmbiguousStripeError,
  stripeUnavailable,
  stripeStateUncertain,
};
