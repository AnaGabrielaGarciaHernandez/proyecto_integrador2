const { randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');

function createSessionToken(user, options, sessionId = randomUUID()) {
  const token = jwt.sign(
    {
      role: user.role,
      name: user.full_name,
    },
    options.privateKey,
    {
      algorithm: 'RS256',
      subject: user.id,
      jwtid: sessionId,
      issuer: options.issuer,
      audience: options.audience,
      expiresIn: options.expiresIn,
    },
  );
  const decoded = jwt.decode(token);
  return {
    id: sessionId,
    token,
    expiresAt: new Date(decoded.exp * 1000),
  };
}

function verifySessionToken(token, options) {
  return jwt.verify(token, options.publicKey || options.privateKey, {
    algorithms: ['RS256'],
    issuer: options.issuer,
    audience: options.audience,
  });
}

function getBearerToken(req) {
  const header = req.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

function getSessionToken(req, cookieName) {
  return req.cookies?.[cookieName] || getBearerToken(req);
}

function sessionCookieOptions(nodeEnv) {
  return {
    httpOnly: true,
    sameSite: nodeEnv === 'production' ? 'none' : 'lax',
    secure: nodeEnv === 'production',
    path: '/',
  };
}

function setSessionCookie(res, cookieName, token, nodeEnv) {
  res.cookie(cookieName, token, sessionCookieOptions(nodeEnv));
}

function clearSessionCookie(res, cookieName, nodeEnv) {
  res.clearCookie(cookieName, sessionCookieOptions(nodeEnv));
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
    avatar_url: user.avatar_url || null,
    is_active: user.is_active,
    created_at: user.created_at,
    preferences: {
      show_home_sell_banner: user.show_home_sell_banner,
    },
  };
}

module.exports = {
  createSessionToken,
  verifySessionToken,
  getSessionToken,
  sessionCookieOptions,
  setSessionCookie,
  clearSessionCookie,
  serializeUser,
};
