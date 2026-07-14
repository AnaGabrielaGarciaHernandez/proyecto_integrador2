const { createHttpError } = require('@ecobazar/platform');

function requireUser(req, res, next) {
  void res;
  const id = req.get('x-user-id');
  if (!isUuid(id)) return next(createHttpError('Authentication required', 401));
  req.user = {
    id,
    role: req.get('x-user-role') || 'cliente',
    name: req.get('x-user-name') || 'Cliente',
  };
  return next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    void res;
    if (!roles.includes(req.user?.role)) return next(createHttpError('Forbidden', 403));
    return next();
  };
}

function ensureUuid(value) {
  if (!isUuid(value)) throw createHttpError('Order not found', 404);
  return value;
}

function isUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

module.exports = { requireUser, requireRole, ensureUuid };
