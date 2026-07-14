const express = require('express');
const bcrypt = require('bcrypt');
const { EVENT_TYPES } = require('@ecobazar/contracts');
const { createEvent, createHttpError, insertOutbox } = require('@ecobazar/platform');
const {
  clearSessionCookie,
  createSessionToken,
  getSessionToken,
  serializeUser,
  setSessionCookie,
  verifySessionToken,
} = require('../services/session');
const { googleSchema, loginSchema, registerSchema } = require('../services/validation');

const userColumns = `
  id, email, full_name, password_hash, auth_provider, role,
  phone, bio, is_active, created_at
`;

function createAuthRouter({ db, config, privateKey, publicKey, googleClient, requireAuth }) {
  const router = express.Router();
  const tokenOptions = {
    privateKey,
    issuer: config.JWT_ISSUER,
    audience: config.JWT_AUDIENCE,
    expiresIn: config.JWT_EXPIRES_IN,
  };

  router.post('/register', async (req, res, next) => {
    try {
      const input = parseBody(registerSchema, req.body);
      const passwordHash = await bcrypt.hash(input.password, 12);

      const created = await db.transaction(async (client) => {
        const result = await client.query(
          `INSERT INTO identity.users
             (email, full_name, password_hash, auth_provider, phone, email_verified_at)
           VALUES ($1, $2, $3, 'email', $4, now())
           RETURNING ${userColumns}`,
          [input.email, input.full_name, passwordHash, input.phone || null],
        );
        const user = result.rows[0];
        const session = await createSession(client, user, tokenOptions);
        await enqueueUserRegistered(client, user, req.correlationId);
        return { user, session };
      });

      setSessionCookie(
        res,
        config.COOKIE_NAME,
        created.session.token,
        config.NODE_ENV,
      );
      res.status(201).json({ user: serializeUser(created.user) });
    } catch (error) {
      next(normalizeUniqueEmailError(error));
    }
  });

  router.post('/login', async (req, res, next) => {
    try {
      const input = parseBody(loginSchema, req.body);
      const result = await db.query(
        `SELECT ${userColumns}
         FROM identity.users
         WHERE lower(email) = lower($1) AND is_active = true`,
        [input.email],
      );
      const user = result.rows[0];
      const passwordMatches = user?.password_hash
        ? await bcrypt.compare(input.password, user.password_hash)
        : false;
      if (!user || !passwordMatches) {
        throw createHttpError('Invalid email or password', 401);
      }

      const session = await db.transaction(async (client) => {
        await client.query(
          'UPDATE identity.users SET last_login_at = now() WHERE id = $1',
          [user.id],
        );
        return createSession(client, user, tokenOptions);
      });
      setSessionCookie(res, config.COOKIE_NAME, session.token, config.NODE_ENV);
      res.json({ user: serializeUser(user) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/logout', async (req, res, next) => {
    try {
      const token = getSessionToken(req, config.COOKIE_NAME);
      if (token) {
        try {
          const payload = verifySessionToken(token, {
            publicKey,
            issuer: config.JWT_ISSUER,
            audience: config.JWT_AUDIENCE,
          });
          await db.query(
            `UPDATE identity.sessions
             SET revoked_at = COALESCE(revoked_at, now())
             WHERE id = $1 AND user_id = $2`,
            [payload.jti, payload.sub],
          );
        } catch (error) {
          if (error.name !== 'JsonWebTokenError' && error.name !== 'TokenExpiredError') {
            throw error;
          }
        }
      }
      clearSessionCookie(res, config.COOKIE_NAME, config.NODE_ENV);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json({ user: serializeUser(req.user) });
  });

  router.post('/google', async (req, res, next) => {
    try {
      if (!config.GOOGLE_CLIENT_ID) {
        throw createHttpError('GOOGLE_CLIENT_ID is not configured', 503);
      }
      const input = parseBody(googleSchema, req.body);
      const ticket = await googleClient.verifyIdToken({
        idToken: input.id_token,
        audience: config.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      if (!payload?.email || !payload.sub) {
        throw createHttpError('Invalid Google token payload', 401);
      }

      const authenticated = await db.transaction(async (client) => {
        const { user, isNew } = await findOrCreateGoogleUser(client, payload);
        const session = await createSession(client, user, tokenOptions);
        if (isNew) await enqueueUserRegistered(client, user, req.correlationId);
        return { user, session };
      });

      setSessionCookie(
        res,
        config.COOKIE_NAME,
        authenticated.session.token,
        config.NODE_ENV,
      );
      res.json({ user: serializeUser(authenticated.user) });
    } catch (error) {
      next(normalizeUniqueEmailError(error));
    }
  });

  return router;
}

async function findOrCreateGoogleUser(client, payload) {
  const existingBySub = await client.query(
    `UPDATE identity.users
     SET last_login_at = now()
     WHERE google_sub = $1 AND is_active = true
     RETURNING ${userColumns}`,
    [payload.sub],
  );
  if (existingBySub.rows[0]) return { user: existingBySub.rows[0], isNew: false };

  const existingByEmail = await client.query(
    `SELECT id FROM identity.users
     WHERE lower(email) = lower($1) AND is_active = true
     FOR UPDATE`,
    [payload.email],
  );
  if (existingByEmail.rows[0]) {
    const updated = await client.query(
      `UPDATE identity.users
       SET auth_provider = 'google',
           google_sub = $2,
           google_email_verified = $3,
           full_name = COALESCE(NULLIF(full_name, ''), $4),
           email_verified_at = COALESCE(email_verified_at, $5),
           last_login_at = now()
       WHERE id = $1
       RETURNING ${userColumns}`,
      [
        existingByEmail.rows[0].id,
        payload.sub,
        Boolean(payload.email_verified),
        payload.name || payload.email,
        payload.email_verified ? new Date() : null,
      ],
    );
    return { user: updated.rows[0], isNew: false };
  }

  const inserted = await client.query(
    `INSERT INTO identity.users
       (email, full_name, auth_provider, google_sub, google_email_verified,
        email_verified_at, last_login_at)
     VALUES ($1, $2, 'google', $3, $4, $5, now())
     RETURNING ${userColumns}`,
    [
      payload.email.toLowerCase(),
      payload.name || payload.email,
      payload.sub,
      Boolean(payload.email_verified),
      payload.email_verified ? new Date() : null,
    ],
  );
  return { user: inserted.rows[0], isNew: true };
}

async function createSession(client, user, tokenOptions) {
  const session = createSessionToken(user, tokenOptions);
  await client.query(
    `INSERT INTO identity.sessions (id, user_id, expires_at)
     VALUES ($1, $2, $3)`,
    [session.id, user.id, session.expiresAt],
  );
  return session;
}

async function enqueueUserRegistered(client, user, correlationId) {
  const event = createEvent({
    eventType: EVENT_TYPES.USER_REGISTERED,
    producer: 'identity-service',
    correlationId,
    payload: {
      user_id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      is_active: user.is_active,
    },
  });
  await insertOutbox(client, event);
  console.log(
    `[identity-service] correlation_id=${correlationId} event_type=${event.event_type} step=outbox_created`,
  );
}

function parseBody(schema, body) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw createHttpError('Invalid request body', 400, parsed.error.flatten());
  }
  return parsed.data;
}

function normalizeUniqueEmailError(error) {
  if (error.code !== '23505') return error;
  return createHttpError('Email already registered', 409);
}

module.exports = { createAuthRouter };
