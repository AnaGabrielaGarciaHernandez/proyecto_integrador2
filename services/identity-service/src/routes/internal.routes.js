const express = require('express');
const { z } = require('zod');
const { EVENT_TYPES } = require('@ecobazar/contracts');
const { createEvent, createHttpError, insertOutbox } = require('@ecobazar/platform');
const { serializeUser } = require('../services/session');

const paramsSchema = z.object({ id: z.string().uuid() });
const roleSchema = z.object({
  role: z.enum(['cliente', 'vendedor', 'admin']),
});

function createInternalRouter({ db, requireInternalToken }) {
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
                u.phone, u.bio, u.is_active, u.created_at,
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
                  is_active, created_at, show_home_sell_banner
           FROM identity.users
           WHERE id = $1 AND is_active = true
           FOR UPDATE`,
          [params.data.id],
        );
        const previous = existing.rows[0];
        if (!previous) throw createHttpError('User not found', 404);
        if (previous.role === input.data.role) return previous;

        const updated = await client.query(
          `UPDATE identity.users
           SET role = $2
           WHERE id = $1
           RETURNING id, email, full_name, auth_provider, role, phone, bio,
                     is_active, created_at, show_home_sell_banner`,
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
      const result = await db.query(
        `SELECT id, email, full_name, auth_provider, role, phone, is_active, created_at
         FROM identity.users
         ORDER BY created_at DESC`
      );
      res.json({ users: result.rows });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/users/:id/suspend', async (req, res, next) => {
    try {
      const { id } = req.params;
      const { is_active } = req.body;
      const result = await db.query(
        `UPDATE identity.users SET is_active = $1 WHERE id = $2 RETURNING id`,
        [is_active, id]
      );
      if (result.rowCount === 0) throw createHttpError('User not found', 404);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/users/:id', async (req, res, next) => {
    try {
      const { id } = req.params;
      const result = await db.query(`DELETE FROM identity.users WHERE id = $1`, [id]);
      if (result.rowCount === 0) throw createHttpError('User not found', 404);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createInternalRouter };
