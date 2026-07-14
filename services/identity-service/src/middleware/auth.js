const { createHttpError } = require('@ecobazar/platform');
const { getSessionToken, verifySessionToken } = require('../services/session');

function createRequireAuth({ db, config, publicKey }) {
  return async function requireAuth(req, res, next) {
    try {
      const token = getSessionToken(req, config.COOKIE_NAME);
      if (!token) throw createHttpError('Authentication required', 401);

      const payload = verifySessionToken(token, {
        publicKey,
        issuer: config.JWT_ISSUER,
        audience: config.JWT_AUDIENCE,
      });
      const result = await db.query(
        `SELECT u.id, u.email, u.full_name, u.auth_provider, u.role,
                u.phone, u.bio, u.is_active, u.created_at
         FROM identity.sessions AS s
         JOIN identity.users AS u ON u.id = s.user_id
         WHERE s.id = $1
           AND s.user_id = $2
           AND s.revoked_at IS NULL
           AND s.expires_at > now()
           AND u.is_active = true`,
        [payload.jti, payload.sub],
      );
      if (!result.rows[0]) throw createHttpError('Invalid session', 401);

      req.user = result.rows[0];
      req.sessionPayload = payload;
      return next();
    } catch (error) {
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        return next(createHttpError('Invalid or expired session', 401));
      }
      return next(error);
    }
  };
}

module.exports = { createRequireAuth };
