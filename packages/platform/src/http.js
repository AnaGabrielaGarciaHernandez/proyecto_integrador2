const { randomUUID, timingSafeEqual } = require('node:crypto');

const PUBLIC_SERVER_ERROR_CODES = new Set([
  'AVATAR_STORAGE_UNAVAILABLE',
  'CATALOG_UNAVAILABLE',
  'CHECKOUT_IN_PROGRESS',
  'DEPENDENCY_INVALID_RESPONSE',
  'DEPENDENCY_UNAVAILABLE',
  'INTERNAL_ERROR',
  'PRIVACY_DELETION_UNAVAILABLE',
  'PRIVACY_EXPORT_UNAVAILABLE',
  'PRIVACY_SERVICE_UNAVAILABLE',
  'SERVICE_UNAVAILABLE',
  'STRIPE_UNAVAILABLE',
]);

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
    safeLog('info', serviceName, {
      correlation_id: req.correlationId,
      method: req.method,
      path: req.path || '/',
      step: 'request_started',
    });
    res.on('finish', () => {
      safeLog('info', serviceName, {
        correlation_id: req.correlationId,
        method: req.method,
        path: req.path || '/',
        status: res.statusCode,
        duration_ms: Date.now() - started,
        step: 'request_finished',
      });
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
  next(createHttpError(`Route not found: ${req.method} ${req.path || '/'}`, 404));
}

function errorHandler(error, req, res, next) {
  void next;
  const status = error.status || error.statusCode || 500;
  if (status >= 500) {
    safeLog('error', req.serviceName || 'service', {
      correlation_id: req.correlationId || 'unknown',
      method: req.method,
      path: req.path || '/',
      step: 'request_failed',
    }, error);
    const code = isPublicErrorCode(error.details?.code)
      ? error.details.code
      : 'INTERNAL_ERROR';
    return res.status(status).json({
      error: {
        message: 'Internal server error',
        details: { code },
      },
    });
  }
  return res.status(status).json({ error: { message: error.message || 'Internal server error', details: error.details } });
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isPublicErrorCode(value) {
  return PUBLIC_SERVER_ERROR_CODES.has(value);
}

const REDACTION_PATTERNS = [
  /\b(?:sb_(?:secret|publishable)|sk_(?:live|test))_[A-Za-z0-9_-]+\b/gi,
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  /\b(?:password|passphrase|token|secret|api[_-]?key|authorization)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^,\s}]+)/gi,
];

function redactString(value) {
  let result = String(value);
  for (const pattern of REDACTION_PATTERNS) {
    result = result.replace(pattern, (match) => {
      if (/^[^:=]+[:=]/.test(match)) return match.replace(/([:=])(?:.*)$/, '$1[REDACTED]');
      return '[REDACTED]';
    });
  }
  return result.slice(0, 500);
}

function sanitizeLogValue(value, key = '', seen = new WeakSet()) {
  const sensitiveKey = /(?:password|passphrase|token|secret|api[_-]?key|authorization|cookie|raw_event|body|image|buffer|content)/i;
  if (sensitiveKey.test(key)) return '[REDACTED]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Buffer.isBuffer(value)) return '[REDACTED]';
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeLogValue(item, '', seen));
  return Object.fromEntries(Object.entries(value).slice(0, 40).map(([entryKey, entryValue]) => [
    entryKey,
    sanitizeLogValue(entryValue, entryKey, seen),
  ]));
}

function summarizeError(error) {
  if (!error) return undefined;
  const summary = {
    name: error.name || 'Error',
  };
  if (error.code !== undefined) summary.code = redactString(error.code);
  if (error.status !== undefined) summary.status = error.status;
  if (error.statusCode !== undefined) summary.status_code = error.statusCode;
  if (error.details?.code !== undefined) summary.details_code = redactString(error.details.code);
  if (error.details?.dependency !== undefined) summary.dependency = redactString(error.details.dependency);
  return summary;
}

function safeLog(level, serviceName, fields = {}, error) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    service: serviceName || 'service',
    ...sanitizeLogValue(fields),
  };
  if (error) payload.error = summarizeError(error);
  const writer = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  writer(JSON.stringify(payload));
}

module.exports = {
  createHttpError,
  correlationMiddleware,
  requestLogger,
  requireInternalToken,
  notFound,
  errorHandler,
  redactString,
  safeLog,
  summarizeError,
};
