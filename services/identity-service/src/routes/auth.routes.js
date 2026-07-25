const express = require('express');
const bcrypt = require('bcrypt');
const multer = require('multer');
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
const {
  googleSchema,
  loginSchema,
  preferencesSchema,
  profileSchema,
  registerSchema,
} = require('../services/validation');
const {
  AVATAR_ALLOWED_MIME_TYPES,
  createAvatarProcessor,
} = require('../services/avatar');
const { createAvatarRateLimiter } = require('../services/avatar-rate-limit');

const userColumns = `
  id, email, full_name, password_hash, auth_provider, role,
  phone, bio, avatar_url, is_active, created_at, show_home_sell_banner
`;

function createAuthRouter({
  db,
  config,
  privateKey,
  publicKey,
  googleClient,
  requireAuth,
  avatarStorage = null,
  avatarProcessor,
  avatarRateLimiter,
} = {}) {
  const router = express.Router();
  const tokenOptions = {
    privateKey,
    issuer: config.JWT_ISSUER,
    audience: config.JWT_AUDIENCE,
    expiresIn: config.JWT_EXPIRES_IN,
  };
  const processAvatar = avatarProcessor || createAvatarProcessor(config);
  const rateLimiter = avatarRateLimiter || createAvatarRateLimiter({
    maxAttempts: config.AVATAR_RATE_LIMIT_MAX,
    windowMs: config.AVATAR_RATE_LIMIT_WINDOW_MS,
  });
  const profileUpload = createProfileUploadMiddleware({
    config,
    rateLimiter,
  });

  router.post('/register', async (req, res, next) => {
    try {
      const input = parseBody(registerSchema, req.body);
      const passwordHash = await bcrypt.hash(input.password, 12);

      const created = await db.transaction(async (client) => {
        const result = await client.query(
          `INSERT INTO identity.users
             (email, full_name, password_hash, auth_provider, phone, avatar_url, email_verified_at)
           VALUES ($1, $2, $3, 'email', $4, $5, now())
           RETURNING ${userColumns}`,
          [input.email, input.full_name, passwordHash, input.phone || null, null],
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

  router.patch('/preferences', requireAuth, createUpdatePreferencesHandler({ db }));
  router.patch(
    '/profile',
    requireAuth,
    profileUpload,
    createUpdateProfileHandler({ db, avatarStorage, processAvatar }),
  );

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

function createUpdatePreferencesHandler({ db }) {
  return async function updatePreferences(req, res, next) {
    try {
      const input = parseBody(preferencesSchema, req.body);
      const result = await db.query(
        `UPDATE identity.users
         SET show_home_sell_banner = $2
         WHERE id = $1 AND is_active = true
         RETURNING ${userColumns}`,
        [req.user.id, input.show_home_sell_banner],
      );
      if (!result.rows[0]) throw createHttpError('Invalid session', 401);
      res.json({ user: serializeUser(result.rows[0]) });
    } catch (error) {
      next(error);
    }
  };
}

function createUpdateProfileHandler({
  db,
  avatarStorage = null,
  processAvatar = createAvatarProcessor(),
  logger = console,
} = {}) {
  return async function updateProfile(req, res, next) {
    let uploadedAvatar;
    try {
      const input = parseBody(profileSchema, req.body);
      const hasAvatarUpdate = Boolean(req.file);
      let avatarUrl;

      if (hasAvatarUpdate) {
        if (!avatarStorage) {
          throw createHttpError(
            'El almacenamiento de avatares no está configurado.',
            503,
            { code: 'AVATAR_STORAGE_NOT_CONFIGURED' },
          );
        }
        const optimized = await processAvatar(req.file);
        uploadedAvatar = await avatarStorage.uploadAvatar({
          userId: req.user.id,
          buffer: optimized.buffer,
        });
        avatarUrl = uploadedAvatar.publicUrl;
      }

      const update = hasAvatarUpdate
        ? {
          text: `UPDATE identity.users
           SET full_name = $2,
               avatar_url = $3
           WHERE id = $1 AND is_active = true
           RETURNING ${userColumns}`,
          params: [req.user.id, input.full_name, avatarUrl],
        }
        : {
          text: `UPDATE identity.users
           SET full_name = $2
           WHERE id = $1 AND is_active = true
           RETURNING ${userColumns}`,
          params: [req.user.id, input.full_name],
        };
      const result = await db.query(
        update.text,
        update.params,
      );
      if (!result.rows[0]) throw createHttpError('Invalid session', 401);

      if (uploadedAvatar && req.user.avatar_url && avatarStorage.deleteOwnedAvatar) {
        try {
          await avatarStorage.deleteOwnedAvatar(req.user.avatar_url, req.user.id);
        } catch (error) {
          logAvatarFailure(logger, req, error, 'old_avatar_cleanup_failed');
        }
      }

      res.json({ user: serializeUser(result.rows[0]) });
    } catch (error) {
      if (uploadedAvatar && avatarStorage?.deleteAvatar) {
        try {
          await avatarStorage.deleteAvatar(uploadedAvatar.path);
        } catch (cleanupError) {
          logAvatarFailure(logger, req, cleanupError, 'new_avatar_compensation_failed');
        }
      }
      if (req.file || isMultipartRequest(req) || error.details?.code?.startsWith('AVATAR_')) {
        logAvatarFailure(logger, req, error, 'avatar_upload_failed');
      }
      next(error);
    }
  };
}

function createProfileUploadMiddleware({ config = {}, rateLimiter } = {}) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: config.AVATAR_MAX_INPUT_BYTES || 5 * 1024 * 1024,
      files: 1,
      fields: 1,
      // Busboy emits its partsLimit event as soon as the configured count is
      // reached, so keep one spare part while files/fields remain strictly capped.
      parts: 3,
      fieldNameSize: 50,
      fieldSize: 1024,
    },
    fileFilter(req, file, callback) {
      if (!AVATAR_ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        callback(createHttpError(
          'El avatar debe ser JPEG, PNG o WebP.',
          415,
          { code: 'AVATAR_TYPE_NOT_ALLOWED' },
        ));
        return;
      }
      callback(null, true);
    },
  });

  return function parseProfileRequest(req, res, next) {
    if (req.is?.('application/json')) return next();
    if (!req.is?.('multipart/form-data')) {
      const error = createHttpError(
        'El perfil debe enviarse como JSON o multipart/form-data.',
        415,
        { code: 'PROFILE_CONTENT_TYPE_NOT_SUPPORTED' },
      );
      logAvatarFailure(console, req, error, 'profile_content_type_rejected');
      return next(error);
    }

    const rateLimitResult = rateLimiter?.consume(req.user?.id || 'anonymous');
    if (rateLimitResult && !rateLimitResult.allowed) {
      res.set('Retry-After', String(rateLimitResult.retryAfterSeconds));
      const error = createHttpError(
        'Has alcanzado el límite temporal de cambios de avatar.',
        429,
        {
          code: 'AVATAR_RATE_LIMITED',
          retry_after_seconds: rateLimitResult.retryAfterSeconds,
        },
      );
      logAvatarFailure(console, req, error, 'avatar_rate_limited');
      return next(error);
    }

    return upload.single('avatar')(req, res, (error) => {
      if (!error) return next();
      const normalized = normalizeMultipartError(error);
      logAvatarFailure(console, req, normalized, 'multipart_rejected');
      return next(normalized);
    });
  };
}

function normalizeMultipartError(error) {
  if (error.status) return error;
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return createHttpError(
        'El avatar no puede superar los 5 MB.',
        413,
        { code: 'AVATAR_INPUT_TOO_LARGE' },
      );
    }

    const multipartErrors = {
      LIMIT_UNEXPECTED_FILE: {
        message: error.field === 'avatar'
          ? 'Solo se permite un archivo en el campo avatar.'
          : 'El archivo debe enviarse en el campo avatar.',
        code: 'AVATAR_MULTIPART_FILE_INVALID',
      },
      LIMIT_FILE_COUNT: {
        message: 'La petición de avatar solo puede contener un archivo.',
        code: 'AVATAR_MULTIPART_FILE_COUNT',
      },
      LIMIT_PART_COUNT: {
        message: 'La petición de avatar solo puede contener full_name y un archivo avatar.',
        code: 'AVATAR_MULTIPART_PART_COUNT',
      },
      LIMIT_FIELD_COUNT: {
        message: 'La petición de avatar solo puede contener el campo full_name.',
        code: 'AVATAR_MULTIPART_FIELD_COUNT',
      },
      LIMIT_FIELD_KEY: {
        message: 'El nombre de un campo de la petición de avatar no es válido.',
        code: 'AVATAR_MULTIPART_FIELD_NAME',
      },
      LIMIT_FIELD_VALUE: {
        message: 'El nombre del perfil es demasiado largo.',
        code: 'AVATAR_MULTIPART_FIELD_VALUE',
      },
    };
    const knownError = multipartErrors[error.code];
    if (knownError) return createHttpError(knownError.message, 400, { code: knownError.code });

    return createHttpError(
      'La petición de avatar debe contener un solo archivo llamado avatar.',
      400,
      { code: `AVATAR_MULTIPART_${error.code || 'INVALID'}` },
    );
  }
  return createHttpError('No se pudo recibir el avatar.', 400, { code: 'AVATAR_MULTIPART_INVALID' });
}

function isMultipartRequest(req) {
  return Boolean(req.is?.('multipart/form-data'));
}

function logAvatarFailure(logger, req, error, fallbackReason) {
  const reason = error?.details?.code || fallbackReason;
  const message = `[identity-service] correlation_id=${req.correlationId || 'unknown'} user_id=${req.user?.id || 'unknown'} reason=${reason}`;
  if (typeof logger?.warn === 'function') logger.warn(message);
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

module.exports = {
  createAuthRouter,
  createProfileUploadMiddleware,
  createUpdatePreferencesHandler,
  createUpdateProfileHandler,
  normalizeMultipartError,
};
