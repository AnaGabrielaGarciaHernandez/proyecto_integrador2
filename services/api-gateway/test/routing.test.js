const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createServiceTargets,
  resolveService,
  resolveTarget,
} = require('../src/services/routing');

const config = {
  IDENTITY_SERVICE_URL: 'http://identity:4001',
  CATALOG_SERVICE_URL: 'http://catalog:4002',
  CART_SERVICE_URL: 'http://cart:4003',
  ORDER_SERVICE_URL: 'http://order:4004',
  PAYMENT_SERVICE_URL: 'http://payment:4005',
  MODERATION_SERVICE_URL: 'http://moderation:4006',
};

test('routes every stable public API family to its owning service', () => {
  const cases = {
    '/api/auth/me': 'identity',
    '/api/products': 'catalog',
    '/api/seller/profile': 'catalog',
    '/api/cart/items': 'cart',
    '/api/checkout/order-id/cancel': 'order',
    '/api/orders/order-id': 'order',
    '/api/seller/orders/order-id': 'order',
    '/api/stripe/webhook': 'payment',
    '/api/admin/reports': 'moderation',
    '/api/reviews/product-id': 'moderation',
  };
  for (const [pathname, service] of Object.entries(cases)) {
    assert.equal(resolveService(pathname), service, pathname);
  }
});

test('uses prefix boundaries and does not proxy unknown routes', () => {
  assert.equal(resolveService('/api/authentic'), null);
  assert.equal(resolveService('/api/unknown'), null);
  const targets = createServiceTargets(config);
  assert.equal(resolveTarget('/api/auth/login', targets), config.IDENTITY_SERVICE_URL);
  assert.equal(resolveTarget('/api/unknown', targets), null);
});
