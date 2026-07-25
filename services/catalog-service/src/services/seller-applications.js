const { createHttpError } = require('@ecobazar/platform');

const SELLER_APPLICATION_FIELDS = `
  id, user_id, requested_display_name, seller_type, description,
  contact_phone, contact_email, contact_address, status,
  rejection_reason, created_at, updated_at`;

async function getLatestSellerApplication(db, userId) {
  const result = await db.query(
    `SELECT ${SELLER_APPLICATION_FIELDS}
     FROM seller_applications
     WHERE user_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [userId],
  );
  return result.rows[0] || null;
}

async function createSellerApplication(db, userId, input) {
  return db.transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [userId]);

    const latest = await client.query(
      `SELECT id, status
       FROM seller_applications
       WHERE user_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [userId],
    );
    if (latest.rows[0]?.status === 'pending') {
      throw createHttpError('Ya tienes una solicitud de vendedor pendiente.', 409, {
        code: 'SELLER_APPLICATION_PENDING',
      });
    }
    if (['approved', 'suspended'].includes(latest.rows[0]?.status)) {
      throw createHttpError('Esta cuenta ya tiene una solicitud aprobada.', 409, {
        code: 'SELLER_APPLICATION_ALREADY_REVIEWED',
      });
    }

    const result = await client.query(
      `INSERT INTO seller_applications
         (user_id, requested_display_name, seller_type, description,
          contact_phone, contact_email, contact_address)
       VALUES ($1, $2, 'store', $3, $4, $5, $6)
       RETURNING ${SELLER_APPLICATION_FIELDS}`,
      [
        userId,
        input.requested_display_name,
        input.description,
        input.contact_phone,
        input.contact_email,
        input.contact_address,
      ],
    );
    return result.rows[0];
  });
}

module.exports = {
  createSellerApplication,
  getLatestSellerApplication,
};
