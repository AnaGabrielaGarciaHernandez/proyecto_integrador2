const { randomUUID } = require('node:crypto');
const bcrypt = require('bcrypt');
const { createHttpError, safeLog } = require('@ecobazar/platform');
const { serializeUser } = require('./session');

const PRIVACY_EXPORT_SCHEMA_VERSION = 1;
const PRIVACY_CONFIRMATION = 'ELIMINAR';
const DEFAULT_PRIVACY_WORKER_INTERVAL_MS = 5000;
const DEFAULT_PRIVACY_REQUEST_TIMEOUT_MS = 5000;
const DEFAULT_PRIVACY_RETENTION_DAYS = 365;

function createPrivacyCoordinator({
  db,
  config = {},
  avatarStorage = null,
  logger = console,
  fetchImpl = fetch,
} = {}) {
  if (!db) throw new Error('createPrivacyCoordinator requires db');

  const services = [
    ['catalog', config.CATALOG_SERVICE_URL],
    ['cart', config.CART_SERVICE_URL],
    ['order', config.ORDER_SERVICE_URL],
    ['payment', config.PAYMENT_SERVICE_URL],
    ['moderation', config.MODERATION_SERVICE_URL],
  ].filter(([, baseUrl]) => Boolean(baseUrl));
  const workerIntervalMs = config.PRIVACY_WORKER_INTERVAL_MS
    || DEFAULT_PRIVACY_WORKER_INTERVAL_MS;
  const requestTimeoutMs = config.PRIVACY_REQUEST_TIMEOUT_MS
    || DEFAULT_PRIVACY_REQUEST_TIMEOUT_MS;
  const retentionDays = config.PRIVACY_RETENTION_DAYS || DEFAULT_PRIVACY_RETENTION_DAYS;
  let workerTimer = null;
  let maintenanceTimer = null;
  let running = false;

  async function exportUser(user, correlationId) {
    const domainEntries = await Promise.all(services.map(async ([name, baseUrl]) => {
      const response = await callInternal(name, baseUrl, `/internal/privacy/users/${user.id}/export`, {
        method: 'GET',
        correlationId,
      });
      return [name, response.data || {}];
    }));

    return {
      schema_version: PRIVACY_EXPORT_SCHEMA_VERSION,
      generated_at: new Date().toISOString(),
      user: serializeUser(user),
      domains: Object.fromEntries(domainEntries),
      excluded: [
        'password_hash',
        'session_tokens',
        'internal_service_tokens',
        'supabase_keys',
        'raw_payment_provider_events',
        'other_users_personal_data',
      ],
    };
  }

  async function requestDeletion(userId, correlationId) {
    return db.transaction(async (client) => {
      const existing = await client.query(
        `SELECT id, status, created_at
         FROM identity.privacy_requests
         WHERE user_id = $1
           AND request_type = 'deletion'
           AND status IN ('pending', 'processing', 'failed')
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId],
      );
      if (existing.rows[0]) return existing.rows[0];

      const userResult = await client.query(
        `SELECT id, is_active
         FROM identity.users
         WHERE id = $1
         FOR UPDATE`,
        [userId],
      );
      if (!userResult.rows[0]) throw createHttpError('Invalid session', 401);

      const request = await client.query(
        `INSERT INTO identity.privacy_requests
           (user_id, request_type, status, correlation_id)
         VALUES ($1, 'deletion', 'pending', $2)
         RETURNING id, status, created_at`,
        [userId, correlationId],
      );
      await client.query(
        `UPDATE identity.users
         SET is_active = false,
             deletion_requested_at = COALESCE(deletion_requested_at, now())
         WHERE id = $1`,
        [userId],
      );
      await client.query(
        `UPDATE identity.sessions
         SET revoked_at = COALESCE(revoked_at, now())
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId],
      );
      return request.rows[0];
    });
  }

  async function processNextDeletion() {
    const request = await claimNextRequest();
    if (!request) return false;

    try {
      for (const [name, baseUrl] of services) {
        await callInternal(
          name,
          baseUrl,
          `/internal/privacy/users/${request.user_id}/anonymize`,
          {
            method: 'POST',
            correlationId: request.correlation_id,
            body: { request_id: request.id },
          },
        );
      }

      const userResult = await db.query(
        `SELECT avatar_url
         FROM identity.users
         WHERE id = $1`,
        [request.user_id],
      );
      const avatarUrl = userResult.rows[0]?.avatar_url;
      if (avatarUrl && avatarStorage?.deleteOwnedAvatar) {
        await avatarStorage.deleteOwnedAvatar(avatarUrl, request.user_id);
      }

      const unusablePasswordHash = await bcrypt.hash(randomUUID(), 4);
      await db.transaction(async (client) => {
        await client.query(
          `UPDATE identity.users
           SET email = $2,
               full_name = 'Usuario eliminado',
               password_hash = $3,
               auth_provider = 'email',
               google_sub = NULL,
               google_email_verified = false,
               role = 'cliente',
               phone = NULL,
               bio = NULL,
               avatar_url = NULL,
               avatar_file_id = NULL,
               stripe_customer_id = NULL,
               is_active = false,
               email_verified_at = NULL,
               last_login_at = NULL,
               deleted_at = COALESCE(deleted_at, now())
           WHERE id = $1`,
          [request.user_id, `deleted-${request.user_id}@invalid.local`, unusablePasswordHash],
        );
        await client.query(
          `DELETE FROM identity.message_outbox
           WHERE payload->'payload'->>'user_id' = $1`,
          [request.user_id],
        );
        await client.query(
          `UPDATE identity.privacy_requests
           SET status = 'completed',
               last_error = NULL,
               completed_at = COALESCE(completed_at, now()),
               updated_at = now()
           WHERE id = $1`,
          [request.id],
        );
      });
      logPrivacy(logger, 'deletion_completed', request);
    } catch (error) {
      await markRequestFailed(request, error);
      logPrivacy(logger, 'deletion_failed', request, error);
    }
    return true;
  }

  async function claimNextRequest() {
    return db.transaction(async (client) => {
      const result = await client.query(
        `SELECT id, user_id, correlation_id, attempts
         FROM identity.privacy_requests
         WHERE request_type = 'deletion'
           AND status IN ('pending', 'failed')
           AND next_attempt_at <= now()
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1`,
      );
      const request = result.rows[0];
      if (!request) return null;
      const updated = await client.query(
        `UPDATE identity.privacy_requests
         SET status = 'processing', attempts = attempts + 1, updated_at = now()
         WHERE id = $1
         RETURNING id, user_id, correlation_id, attempts`,
        [request.id],
      );
      return updated.rows[0];
    });
  }

  async function markRequestFailed(request, error) {
    const attempts = Number(request.attempts || 1);
    const delayMs = Math.min(60 * 60 * 1000, 2 ** Math.min(attempts, 10) * 1000);
    const safeReason = error?.details?.code || error?.code || 'PRIVACY_DELETION_FAILED';
    await db.query(
      `UPDATE identity.privacy_requests
       SET status = 'failed',
           last_error = $2,
           next_attempt_at = $3,
           updated_at = now()
       WHERE id = $1`,
      [request.id, String(safeReason).slice(0, 120), new Date(Date.now() + delayMs)],
    );
  }

  async function callInternal(name, baseUrl, path, {
    method = 'GET',
    body,
    correlationId,
  } = {}) {
    let response;
    try {
      response = await fetchImpl(new URL(path, `${baseUrl.replace(/\/$/, '')}/`), {
        method,
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-internal-token': config.INTERNAL_SERVICE_TOKEN,
          'x-correlation-id': correlationId,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
    } catch (cause) {
      const error = createHttpError('Privacy service unavailable', 503, {
        code: 'PRIVACY_SERVICE_UNAVAILABLE',
        dependency: name,
      });
      error.cause = cause;
      throw error;
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw createHttpError('Privacy service request failed', response.status, {
        code: 'PRIVACY_SERVICE_UNAVAILABLE',
        dependency: name,
      });
    }
    return payload;
  }

  function start() {
    if (workerTimer) return stop;
    running = true;
    workerTimer = setInterval(() => {
      void processNextDeletion().catch((error) => {
        logPrivacy(logger, 'worker_failed', null, error);
      });
    }, workerIntervalMs);
    workerTimer.unref?.();
    maintenanceTimer = setInterval(() => {
      void runMaintenance().catch((error) => logPrivacy(logger, 'maintenance_failed', null, error));
    }, Math.max(workerIntervalMs, 60 * 60 * 1000));
    maintenanceTimer.unref?.();
    return stop;
  }

  async function runMaintenance() {
    await db.query(
      `DELETE FROM identity.sessions
       WHERE expires_at < now() - interval '30 days'
      OR (revoked_at IS NOT NULL AND revoked_at < now() - interval '30 days')`,
    );
    await db.query(
      `DELETE FROM identity.rate_limit_buckets
       WHERE updated_at < now() - interval '2 days'`,
    );
    await db.query(
      `DELETE FROM identity.privacy_requests
       WHERE status = 'completed'
         AND retention_hold = false
         AND completed_at < now() - ($1 * interval '1 day')`,
      [retentionDays],
    );
    await db.query(
      `DELETE FROM identity.users u
       WHERE u.deleted_at IS NOT NULL
         AND u.deleted_at < now() - ($1 * interval '1 day')
         AND NOT EXISTS (
           SELECT 1 FROM identity.privacy_requests p
           WHERE p.user_id = u.id
         )`,
      [retentionDays],
    );
  }

  async function stop() {
    running = false;
    if (workerTimer) clearInterval(workerTimer);
    if (maintenanceTimer) clearInterval(maintenanceTimer);
    workerTimer = null;
    maintenanceTimer = null;
  }

  return {
    exportUser,
    requestDeletion,
    processNextDeletion,
    runMaintenance,
    start,
    stop,
    isRunning: () => running,
  };
}

function logPrivacy(logger, step, request, error) {
  const fields = {
    step,
    request_id: request?.id,
    user_id: request?.user_id,
    correlation_id: request?.correlation_id,
    reason: error?.details?.code || error?.code,
  };
  if (logger && logger !== console && typeof logger.warn === 'function' && error) {
    logger.warn(JSON.stringify(fields));
    return;
  }
  if (logger && logger !== console && typeof logger.info === 'function') {
    logger.info(JSON.stringify(fields));
    return;
  }
  safeLog(error ? 'warn' : 'info', 'identity-service', fields, error);
}

module.exports = {
  DEFAULT_PRIVACY_REQUEST_TIMEOUT_MS,
  DEFAULT_PRIVACY_RETENTION_DAYS,
  DEFAULT_PRIVACY_WORKER_INTERVAL_MS,
  PRIVACY_CONFIRMATION,
  PRIVACY_EXPORT_SCHEMA_VERSION,
  createPrivacyCoordinator,
};
