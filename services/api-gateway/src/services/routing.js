const ROUTES = Object.freeze([
  { prefix: '/api/seller/orders', service: 'order' },
  { prefix: '/api/auth', service: 'identity' },
  { prefix: '/api/products', service: 'catalog' },
  { prefix: '/api/wishlist', service: 'catalog' },
  { prefix: '/api/seller', service: 'catalog' },
  { prefix: '/api/cart', service: 'cart' },
  { prefix: '/api/checkout', service: 'order' },
  { prefix: '/api/orders', service: 'order' },
  { prefix: '/api/stripe', service: 'payment' },
  { prefix: '/api/admin', service: 'moderation' },
  { prefix: '/api/reviews', service: 'moderation' },
]);

function createServiceTargets(config) {
  return Object.freeze({
    identity: config.IDENTITY_SERVICE_URL,
    catalog: config.CATALOG_SERVICE_URL,
    cart: config.CART_SERVICE_URL,
    order: config.ORDER_SERVICE_URL,
    payment: config.PAYMENT_SERVICE_URL,
    moderation: config.MODERATION_SERVICE_URL,
  });
}

function resolveService(pathname, routes = ROUTES) {
  return routes.find(({ prefix }) => matchesPrefix(pathname, prefix))?.service || null;
}

function resolveTarget(pathname, targets, routes = ROUTES) {
  const service = resolveService(pathname, routes);
  return service ? targets[service] : null;
}

function matchesPrefix(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

module.exports = {
  createServiceTargets,
  resolveService,
  resolveTarget,
};
