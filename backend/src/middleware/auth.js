const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { query } = require('../config/db');

function signSession(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN },
  );
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
  };
}

function setSessionCookie(res, user) {
  res.cookie(env.COOKIE_NAME, signSession(user), sessionCookieOptions());
}

function clearSessionCookie(res) {
  res.clearCookie(env.COOKIE_NAME, sessionCookieOptions());
}

function serializeUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    auth_provider: user.auth_provider,
    phone: user.phone,
    bio: user.bio,
    is_active: user.is_active,
    created_at: user.created_at,
  };
}

async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[env.COOKIE_NAME] || getBearerToken(req);
    if (!token) {
      const error = new Error('Authentication required');
      error.status = 401;
      throw error;
    }

    const payload = jwt.verify(token, env.JWT_SECRET);
    const result = await query(
      `SELECT id, email, full_name, auth_provider, role, phone, bio, is_active, created_at
       FROM users
       WHERE id = $1 AND is_active = true`,
      [payload.sub],
    );

    if (!result.rows[0]) {
      const error = new Error('Invalid session');
      error.status = 401;
      throw error;
    }

    req.user = result.rows[0];
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      error.status = 401;
      error.message = 'Invalid or expired session';
    }
    return next(error);
  }
}

function getBearerToken(req) {
  const header = req.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length);
}

module.exports = {
  requireAuth,
  setSessionCookie,
  clearSessionCookie,
  serializeUser,
};
