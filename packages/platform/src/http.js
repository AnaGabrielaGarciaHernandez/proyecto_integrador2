const { randomUUID, timingSafeEqual } = require('node:crypto');

function createHttpError(message, status = 500, details) {
  const error = new Error(message);
  error.status = status;
  if (details !== undefined) error.details = details;
  return error;
}

function correlationMiddleware(serviceName) {
  return (req, res, next) => {
    const supplied = req.get('x-correlation-id');
    req.correlationId = isUuid(supplied) ? supplied : randomUUID();
    res.set('x-correlation-id', req.correlationId);
    req.serviceName = serviceName;
    next();
  };
}

function requestLogger(serviceName) {
  return (req, res, next) => {
    const started = Date.now();
    console.log(`[${serviceName}] correlation_id=${req.correlationId} method=${req.method} path=${req.originalUrl} step=request_started`);
    res.on('finish', () => {
      console.log(`[${serviceName}] correlation_id=${req.correlationId} method=${req.method} path=${req.originalUrl} status=${res.statusCode} duration_ms=${Date.now() - started} step=request_finished`);
    });
    next();
  };
}

function requireInternalToken(expectedToken) {
  return (req, res, next) => {
    const actual = req.get('x-internal-token') || '';
    if (!expectedToken || !safeEqual(actual, expectedToken)) {
      return next(createHttpError('Internal service authentication required', 401));
    }
    return next();
  };
}

function notFound(req, res, next) {
  next(createHttpError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
}

function errorHandler(error, req, res, next) {
  void next;
  const status = error.status || error.statusCode || 500;
  if (status >= 500) {
    console.error(`[${req.serviceName || 'service'}] correlation_id=${req.correlationId || 'unknown'} step=request_failed`, error);
  }
  res.status(status).json({ error: { message: error.message || 'Internal server error', details: error.details } });
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

module.exports = {
  createHttpError,
  correlationMiddleware,
  requestLogger,
  requireInternalToken,
  notFound,
  errorHandler,
};
