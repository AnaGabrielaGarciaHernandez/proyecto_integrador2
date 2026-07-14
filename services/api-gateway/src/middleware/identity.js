const jwt = require('jsonwebtoken');

const IDENTITY_HEADERS = Object.freeze([
  'x-user-id',
  'x-user-role',
  'x-user-name',
]);
const ROLES = new Set(['cliente', 'vendedor', 'admin']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createIdentityMiddleware({ config, publicKey, fetchImpl = fetch }) {
  return async function identityMiddleware(req, res, next) {
    stripUntrustedHeaders(req.headers);
    req.headers['x-correlation-id'] = req.correlationId;

    const token = req.cookies?.[config.COOKIE_NAME] || getBearerToken(req);
    if (!token) return next();

    try {
      const payload = jwt.verify(token, publicKey, {
        algorithms: ['RS256'],
        issuer: config.JWT_ISSUER,
        audience: config.JWT_AUDIENCE,
      });
      if (!UUID_PATTERN.test(String(payload.jti || ''))) {
        throw new Error('JWT session id must be a UUID');
      }
      const currentUser = await introspectSession({
        config,
        fetchImpl,
        sessionId: payload.jti,
        userId: payload.sub,
        correlationId: req.correlationId,
      });
      const identity = claimsToIdentity({
        ...payload,
        sub: currentUser.id,
        role: currentUser.role,
        name: currentUser.full_name,
      });
      req.auth = identity;
      req.headers['x-user-id'] = identity.userId;
      req.headers['x-user-role'] = identity.role;
      req.headers['x-user-name'] = identity.name;
    } catch (error) {
      req.authError = error;
      console.log(
        `[api-gateway] correlation_id=${req.correlationId} step=session_ignored reason=invalid_or_expired`,
      );
    }
    return next();
  };
}

async function introspectSession({
  config,
  fetchImpl,
  sessionId,
  userId,
  correlationId,
}) {
  const url = new URL(`/internal/sessions/${encodeURIComponent(sessionId)}`, config.IDENTITY_SERVICE_URL);
  url.searchParams.set('user_id', userId);
  const response = await fetchImpl(url, {
    headers: {
      accept: 'application/json',
      'x-internal-token': config.INTERNAL_SERVICE_TOKEN,
      'x-correlation-id': correlationId,
    },
    signal: AbortSignal.timeout(config.SESSION_TIMEOUT_MS || 2000),
  });
  if (!response.ok) throw new Error('Session is revoked, expired, or unavailable');
  const data = await response.json();
  if (!data?.user) throw new Error('Identity returned an invalid session');
  return data.user;
}

function stripUntrustedHeaders(headers) {
  for (const header of IDENTITY_HEADERS) delete headers[header];
  delete headers['x-internal-token'];
  delete headers['x-correlation-id'];
}

function claimsToIdentity(payload) {
  if (!payload || !UUID_PATTERN.test(String(payload.sub || ''))) {
    throw new Error('JWT subject must be a UUID');
  }
  if (!ROLES.has(payload.role)) throw new Error('JWT role is invalid');
  return {
    userId: payload.sub,
    role: payload.role,
    name: sanitizeHeaderValue(payload.name || ''),
    sessionId: payload.jti || null,
  };
}

function sanitizeHeaderValue(value) {
  return String(value)
    .replace(/[^\x20-\x7e\x80-\xff]/g, '')
    .slice(0, 180);
}

function getBearerToken(req) {
  const header = req.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

module.exports = {
  IDENTITY_HEADERS,
  claimsToIdentity,
  createIdentityMiddleware,
  getBearerToken,
  introspectSession,
  sanitizeHeaderValue,
  stripUntrustedHeaders,
};
