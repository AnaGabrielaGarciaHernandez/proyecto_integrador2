const {
  CartSnapshotSchema,
  InventoryReservationRequestSchema,
  PaymentCheckoutRequestSchema,
} = require('@ecobazar/contracts');
const { createHttpError } = require('@ecobazar/platform');
const env = require('../config/env');
const { createServiceClient } = require('./serviceClient');

const cartHttp = createServiceClient({
  baseUrl: env.CART_SERVICE_URL,
  serviceToken: env.INTERNAL_SERVICE_TOKEN,
  timeoutMs: env.HTTP_TIMEOUT_MS,
  serviceName: 'cart-service',
});
const catalogHttp = createServiceClient({
  baseUrl: env.CATALOG_SERVICE_URL,
  serviceToken: env.INTERNAL_SERVICE_TOKEN,
  timeoutMs: env.HTTP_TIMEOUT_MS,
  serviceName: 'catalog-service',
});
const paymentHttp = createServiceClient({
  baseUrl: env.PAYMENT_SERVICE_URL,
  serviceToken: env.INTERNAL_SERVICE_TOKEN,
  timeoutMs: env.HTTP_TIMEOUT_MS,
  serviceName: 'payment-service',
});

const cartClient = {
  async getSnapshot(buyerId, correlationId) {
    const response = await cartHttp.request(`/internal/carts/${buyerId}/snapshot`, { correlationId });
    const contract = CartSnapshotSchema.safeParse(response.cart);
    if (!contract.success || contract.data.buyer_id !== buyerId) {
      throw createHttpError('Cart snapshot violates the internal contract', 502, {
        code: 'DEPENDENCY_INVALID_RESPONSE', dependency: 'cart-service',
      });
    }
    return contract.data;
  },
};

const catalogClient = {
  async reserve(request, correlationId) {
    const payload = InventoryReservationRequestSchema.parse(request);
    const response = await catalogHttp.request('/internal/reservations', {
      method: 'POST', body: payload, correlationId,
    });
    if (!response.reservation || response.reservation.order_id !== payload.order_id
      || response.reservation.status !== 'active') {
      throw createHttpError('Catalog reservation response is invalid', 502, {
        code: 'DEPENDENCY_INVALID_RESPONSE', dependency: 'catalog-service',
      });
    }
    return response.reservation;
  },
  async release(orderId, correlationId) {
    const response = await catalogHttp.request(`/internal/reservations/${orderId}/release`, {
      method: 'POST', correlationId,
    });
    return response.reservation;
  },
};

const paymentClient = {
  async createCheckout(request, correlationId) {
    const payload = PaymentCheckoutRequestSchema.parse(request);
    const response = await paymentHttp.request('/internal/checkout-sessions', {
      method: 'POST', body: payload, correlationId,
    });
    if (!response.checkout || !response.payment) {
      throw createHttpError('Payment checkout response is invalid', 502, {
        code: 'DEPENDENCY_INVALID_RESPONSE', dependency: 'payment-service',
      });
    }
    if (response.checkout.status === 'open'
      && (!response.checkout.session_id || !response.checkout.url || !response.checkout.expires_at)) {
      throw createHttpError('Payment checkout response is incomplete', 502, {
        code: 'DEPENDENCY_INVALID_RESPONSE', dependency: 'payment-service',
      });
    }
    return response;
  },
  async expire(orderId, correlationId) {
    return paymentHttp.request(`/internal/checkout-sessions/${orderId}/expire`, {
      method: 'POST', correlationId,
    });
  },
};

module.exports = { cartClient, catalogClient, paymentClient };
