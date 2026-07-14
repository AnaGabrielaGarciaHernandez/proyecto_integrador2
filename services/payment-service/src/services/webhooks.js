const { randomUUID } = require('node:crypto');
const { createHttpError } = require('@ecobazar/platform');

function createWebhookService({ payments, stripeProvider, webhookSecret }) {
  function constructEvent(rawBody, signature) {
    if (!signature) {
      throw createHttpError('Missing Stripe signature', 400, { code: 'INVALID_SIGNATURE' });
    }
    const stripe = stripeProvider({ webhook: true });
    try {
      return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (cause) {
      const error = createHttpError('Invalid Stripe signature', 400, { code: 'INVALID_SIGNATURE' });
      error.cause = cause;
      throw error;
    }
  }

  async function processEvent(event) {
    const supported = new Set([
      'checkout.session.completed',
      'checkout.session.expired',
      'checkout.session.async_payment_failed',
    ]);
    if (!supported.has(event.type)) return { ignored: true };
    const session = event.data.object;
    const correlationId = isUuid(session.metadata?.correlation_id)
      ? session.metadata.correlation_id
      : randomUUID();
    const details = await getPaymentDetails(event, stripeProvider);
    const result = await payments.processStripeEvent(event, details, correlationId);
    console.log(`[payment-service] correlation_id=${correlationId} event_type=${event.type} step=${result.duplicate ? 'stripe_event_duplicate' : 'stripe_event_processed'}`);
    return result;
  }

  return { constructEvent, processEvent };
}

async function getPaymentDetails(event, stripeProvider) {
  const session = event.data.object;
  if (event.type !== 'checkout.session.completed'
    || session.payment_status !== 'paid'
    || !session.payment_intent) {
    return {
      failure_code: session.last_payment_error?.code || null,
      failure_message: session.last_payment_error?.message || null,
    };
  }
  const stripe = stripeProvider({ webhook: true });
  const intentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent.id;
  const intent = await stripe.paymentIntents.retrieve(intentId, { expand: ['latest_charge'] });
  const charge = typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
  return {
    intent_id: intent.id,
    charge_id: charge?.id || (typeof intent.latest_charge === 'string' ? intent.latest_charge : null),
    receipt_url: charge?.receipt_url || null,
  };
}

function isUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

module.exports = { createWebhookService, getPaymentDetails };
