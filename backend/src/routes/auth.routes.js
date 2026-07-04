const express = require('express');
const bcrypt = require('bcrypt');
const { OAuth2Client } = require('google-auth-library');
const { z } = require('zod');

const env = require('../config/env');
const { query, transaction } = require('../config/db');
const {
  requireAuth,
  setSessionCookie,
  clearSessionCookie,
  serializeUser,
} = require('../middleware/auth');

const router = express.Router();
const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID || undefined);

const registerSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  full_name: z.string().trim().min(2).max(180),
  password: z.string().min(8).max(128),
  phone: z.string().trim().max(30).optional(),
});

const loginSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  password: z.string().min(1),
});

const googleSchema = z.object({
  id_token: z.string().min(1),
});

router.post('/register', async (req, res, next) => {
  try {
    const input = parseBody(registerSchema, req.body);
    const passwordHash = await bcrypt.hash(input.password, 12);

    const result = await query(
      `INSERT INTO users (email, full_name, password_hash, auth_provider, phone, email_verified_at)
       VALUES ($1, $2, $3, 'email', $4, now())
       RETURNING id, email, full_name, auth_provider, role, phone, bio, is_active, created_at`,
      [input.email, input.full_name, passwordHash, input.phone || null],
    );

    const user = result.rows[0];
    setSessionCookie(res, user);
    res.status(201).json({ user: serializeUser(user) });
  } catch (error) {
    if (error.code === '23505') {
      error.status = 409;
      error.message = 'Email already registered';
    }
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const input = parseBody(loginSchema, req.body);
    const result = await query(
      `SELECT id, email, full_name, password_hash, auth_provider, role, phone, bio, is_active, created_at
       FROM users
       WHERE lower(email) = lower($1) AND is_active = true`,
      [input.email],
    );

    const user = result.rows[0];
    const passwordMatches = user?.password_hash
      ? await bcrypt.compare(input.password, user.password_hash)
      : false;

    if (!user || !passwordMatches) {
      const error = new Error('Invalid email or password');
      error.status = 401;
      throw error;
    }

    await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
    setSessionCookie(res, user);
    res.json({ user: serializeUser(user) });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.status(204).send();
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: serializeUser(req.user) });
});

router.post('/google', async (req, res, next) => {
  try {
    if (!env.GOOGLE_CLIENT_ID) {
      const error = new Error('GOOGLE_CLIENT_ID is not configured');
      error.status = 503;
      throw error;
    }

    const input = parseBody(googleSchema, req.body);
    const ticket = await googleClient.verifyIdToken({
      idToken: input.id_token,
      audience: env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    if (!payload?.email || !payload.sub) {
      const error = new Error('Invalid Google token payload');
      error.status = 401;
      throw error;
    }

    const user = await transaction(async (client) => {
      const existingBySub = await client.query(
        `SELECT id, email, full_name, auth_provider, role, phone, bio, is_active, created_at
         FROM users
         WHERE google_sub = $1 AND is_active = true`,
        [payload.sub],
      );

      if (existingBySub.rows[0]) return existingBySub.rows[0];

      const existingByEmail = await client.query(
        `SELECT id FROM users WHERE lower(email) = lower($1) AND is_active = true`,
        [payload.email],
      );

      if (existingByEmail.rows[0]) {
        const updated = await client.query(
          `UPDATE users
           SET auth_provider = 'google',
               google_sub = $2,
               google_email_verified = $3,
               full_name = COALESCE(NULLIF(full_name, ''), $4),
               last_login_at = now()
           WHERE id = $1
           RETURNING id, email, full_name, auth_provider, role, phone, bio, is_active, created_at`,
          [
            existingByEmail.rows[0].id,
            payload.sub,
            Boolean(payload.email_verified),
            payload.name || payload.email,
          ],
        );
        return updated.rows[0];
      }

      const inserted = await client.query(
        `INSERT INTO users (email, full_name, auth_provider, google_sub, google_email_verified, email_verified_at, last_login_at)
         VALUES ($1, $2, 'google', $3, $4, $5, now())
         RETURNING id, email, full_name, auth_provider, role, phone, bio, is_active, created_at`,
        [
          payload.email.toLowerCase(),
          payload.name || payload.email,
          payload.sub,
          Boolean(payload.email_verified),
          payload.email_verified ? new Date() : null,
        ],
      );
      return inserted.rows[0];
    });

    setSessionCookie(res, user);
    res.json({ user: serializeUser(user) });
  } catch (error) {
    next(error);
  }
});

function parseBody(schema, body) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const error = new Error('Invalid request body');
    error.status = 400;
    error.details = parsed.error.flatten();
    throw error;
  }
  return parsed.data;
}

module.exports = router;
