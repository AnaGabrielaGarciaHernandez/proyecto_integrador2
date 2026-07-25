const express = require('express');
const { z } = require('zod');
const { EVENT_TYPES } = require('@ecobazar/contracts');
const { createEvent, createHttpError, insertOutbox } = require('@ecobazar/platform');
const { serializeUser } = require('../services/session');

const paramsSchema = z.object({ id: z.string().uuid() });
const roleSchema = z.object({
  role: z.enum(['cliente', 'vendedor', 'admin']),
});
const suspendSchema = z.object({
  is_active: z.boolean(),
});
const usersQuerySchema = z.object({
  search: z.string().trim().max(120).default(''),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

function assertAdminUserActionAllowed(user) {
  if (user.deleted_at) {
    throw createHttpError('User not found', 404, { code: 'USER_NOT_FOUND' });
  }
  if (user.deletion_requested_at) {
    throw createHttpError(
      'User deletion is already pending',
      409,
      { code: 'USER_DELETION_PENDING' },
    );
  }
}

function createInternalRouter({ db, requireInternalToken, privacyCoordinator = null }) {
  const router = express.Router();
  router.use(requireInternalToken);

  router.get('/sessions/:id', async (req, res, next) => {
    try {
      const sessionId = z.string().uuid().safeParse(req.params.id);
      const userId = z.string().uuid().safeParse(req.query.user_id);
      if (!sessionId.success || !userId.success) {
        throw createHttpError('Session not found', 404);
      }
      const result = await db.query(
        `SELECT s.id AS session_id, s.expires_at,
                u.id, u.email, u.full_name, u.auth_provider, u.role,
                u.phone, u.bio, u.avatar_url, u.is_active, u.created_at,
                u.show_home_sell_banner
         FROM identity.sessions s
         JOIN identity.users u ON u.id = s.user_id
         WHERE s.id = $1 AND s.user_id = $2
           AND s.revoked_at IS NULL AND s.expires_at > now()
           AND u.is_active = true`,
        [sessionId.data, userId.data],
      );
      if (!result.rows[0]) throw createHttpError('Session not found', 404);
      res.json({
        session: {
          id: result.rows[0].session_id,
          expires_at: result.rows[0].expires_at,
        },
        user: serializeUser(result.rows[0]),
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/users/:id/role', async (req, res, next) => {
    try {
      const params = paramsSchema.safeParse(req.params);
      const input = roleSchema.safeParse(req.body);
      if (!params.success || !input.success) {
        throw createHttpError('Invalid request', 400, {
          params: params.success ? undefined : params.error.flatten(),
          body: input.success ? undefined : input.error.flatten(),
        });
      }

      const result = await db.transaction(async (client) => {
        const existing = await client.query(
          `SELECT id, email, full_name, auth_provider, role, phone, bio,
                  avatar_url, is_active, created_at, show_home_sell_banner,
                  deletion_requested_at, deleted_at
           FROM identity.users
           WHERE id = $1
           FOR UPDATE`,
          [params.data.id],
        );
        const previous = existing.rows[0];
        if (!previous) throw createHttpError('User not found', 404);
        assertAdminUserActionAllowed(previous);
        if (previous.role === input.data.role) return previous;

        const updated = await client.query(
          `UPDATE identity.users
           SET role = $2
           WHERE id = $1
           RETURNING id, email, full_name, auth_provider, role, phone, bio,
                     avatar_url, is_active, created_at, show_home_sell_banner,
                     deletion_requested_at, deleted_at`,
          [params.data.id, input.data.role],
        );
        await client.query(
          `UPDATE identity.sessions
           SET revoked_at = COALESCE(revoked_at, now())
           WHERE user_id = $1 AND revoked_at IS NULL`,
          [params.data.id],
        );

        const event = createEvent({
          eventType: EVENT_TYPES.USER_ROLE_CHANGED,
          producer: 'identity-service',
          correlationId: req.correlationId,
          payload: {
            user_id: params.data.id,
            previous_role: previous.role,
            role: input.data.role,
            full_name: previous.full_name,
            is_active: previous.is_active,
          },
        });
        await insertOutbox(client, event);
        console.log(
          `[identity-service] correlation_id=${req.correlationId} event_type=${event.event_type} step=outbox_created`,
        );
        return updated.rows[0];
      });

      res.json({ user: serializeUser(result) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/users', async (req, res, next) => {
    try {
      const input = usersQuerySchema.safeParse(req.query);
      if (!input.success) {
        throw createHttpError('Invalid request', 400, {
          query: input.error.flatten(),
        });
      }

      const { search, limit, offset } = input.data;
      const searchPattern = `%${search}%`;
      const result = await db.query(
        `SELECT id, email, full_name, auth_provider, role, phone, is_active, created_at,
                deletion_requested_at
         FROM identity.users
         WHERE deleted_at IS NULL
           AND ($1 = '' OR lower(full_name) LIKE lower($2) OR lower(email) LIKE lower($2))
         ORDER BY created_at DESC
         LIMIT $3 OFFSET $4`,
        [search, searchPattern, limit, offset],
      );
      const totalResult = await db.query(
        `SELECT count(*)::integer AS total
         FROM identity.users
         WHERE deleted_at IS NULL
           AND ($1 = '' OR lower(full_name) LIKE lower($2) OR lower(email) LIKE lower($2))`,
        [search, searchPattern],
      );
      const total = Number(totalResult.rows[0]?.total || 0);
      res.json({
        users: result.rows,
        total,
        pagination: {
          limit,
          offset,
          has_more: offset + result.rows.length < total,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/users/:id/suspend', async (req, res, next) => {
    try {
      const params = paramsSchema.safeParse(req.params);
      const input = suspendSchema.safeParse(req.body);
      if (!params.success || !input.success) {
        throw createHttpError('Invalid request', 400, {
          params: params.success ? undefined : params.error.flatten(),
          body: input.success ? undefined : input.error.flatten(),
        });
      }

      const result = await db.transaction(async (client) => {
        const existing = await client.query(
          `SELECT id, deleted_at, deletion_requested_at
           FROM identity.users
           WHERE id = $1
           FOR UPDATE`,
          [params.data.id],
        );
        const user = existing.rows[0];
        if (!user) throw createHttpError('User not found', 404);
        assertAdminUserActionAllowed(user);

        const updated = await client.query(
          `UPDATE identity.users
           SET is_active = $1
           WHERE id = $2 AND deleted_at IS NULL AND deletion_requested_at IS NULL
           RETURNING id, is_active`,
          [input.data.is_active, params.data.id],
        );
        if (!updated.rows[0]) throw createHttpError('User not found', 404);
        return updated.rows[0];
      });
      res.json({ ok: true, user: result });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/users/:id', async (req, res, next) => {
    try {
      const params = paramsSchema.safeParse(req.params);
      if (!params.success) throw createHttpError('User not found', 404);
      if (!privacyCoordinator) {
        throw createHttpError('Privacy deletion is not configured', 503, {
          code: 'PRIVACY_DELETION_UNAVAILABLE',
        });
      }
      const request = await privacyCoordinator.requestDeletion(
        params.data.id,
        req.correlationId,
        { rejectIfPending: true },
      );
      res.status(202).json({ ok: true, request_id: request.id, status: request.status });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createInternalRouter };
