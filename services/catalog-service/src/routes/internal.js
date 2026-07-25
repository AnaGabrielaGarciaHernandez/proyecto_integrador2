const express = require('express');
const { z } = require('zod');
const { InventoryReservationRequestSchema } = require('@ecobazar/contracts');
const { createHttpError, requireInternalToken } = require('@ecobazar/platform');
const { resolveVariants } = require('../services/products');
const {
  reserveInventory,
  releaseInventory,
  confirmInventory,
} = require('../services/inventory');

const ResolveVariantsSchema = z.object({
  variant_ids: z.array(z.string().uuid()).min(1).max(100),
  buyer_id: z.string().uuid().optional(),
});
const UserIdSchema = z.string().uuid();

function createInternalRouter({ db, internalToken }) {
  const router = express.Router();
  router.use(requireInternalToken(internalToken));

  router.post('/variants/resolve', async (req, res, next) => {
    try {
      const input = parse(ResolveVariantsSchema, req.body);
      const ids = [...new Set(input.variant_ids)].sort();
      res.json({ variants: await resolveVariants(db, ids, input.buyer_id) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/reservations', async (req, res, next) => {
    try {
      const input = parse(InventoryReservationRequestSchema, req.body);
      const reservation = await reserveInventory(db, input, req.correlationId);
      res.status(201).json({ reservation });
    } catch (error) {
      next(error);
    }
  });

  router.post('/reservations/:orderId/release', async (req, res, next) => {
    try {
      const orderId = parse(z.string().uuid(), req.params.orderId);
      res.json({ reservation: await releaseInventory(db, orderId, req.correlationId) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/reservations/:orderId/confirm', async (req, res, next) => {
    try {
      const orderId = parse(z.string().uuid(), req.params.orderId);
      res.json({ reservation: await confirmInventory(db, orderId, req.correlationId) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/seller-applications', async (req, res, next) => {
    try {
      const result = await db.query(
        `SELECT id, user_id, requested_display_name, seller_type, description, contact_phone, status, created_at
         FROM catalog.seller_applications
         WHERE status = 'pending'
         ORDER BY created_at ASC`
      );
      res.json({ applications: result.rows });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/seller-applications/:id/status', async (req, res, next) => {
    try {
      const { id } = req.params;
      const { status, rejection_reason } = req.body;
      
      const result = await db.transaction(async (client) => {
        const appRes = await client.query(
          `UPDATE catalog.seller_applications
           SET status = $1, rejection_reason = $2, reviewed_at = now()
           WHERE id = $3 AND status = 'pending'
           RETURNING *`,
          [status, rejection_reason || null, id]
        );
        if (appRes.rowCount === 0) throw createHttpError('Application not found or already processed', 404);
        
        const application = appRes.rows[0];
        
        if (status === 'approved') {
          await client.query(
            `INSERT INTO catalog.seller_profiles (user_id, seller_type, display_name, description, status, phone, verified_at)
             VALUES ($1, $2, $3, $4, 'approved', $5, now())
             ON CONFLICT (user_id) DO NOTHING`,
            [application.user_id, application.seller_type, application.requested_display_name, application.description, application.contact_phone]
          );
        }
        return application;
      });
      
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get('/privacy/users/:userId/export', async (req, res, next) => {
    try {
      const userId = parse(UserIdSchema, req.params.userId);
      const projection = await db.query(
        `SELECT user_id, role, is_active, full_name, updated_at
         FROM catalog.user_role_projection
         WHERE user_id = $1`,
        [userId],
      );
      const sellerProfiles = await db.query(
        `SELECT sp.id, sp.user_id, sp.seller_type, sp.display_name, sp.description,
                sp.status, sp.phone, sp.address_line, sp.city, sp.state,
                sp.postal_code, sp.rating_average, sp.total_sales,
                sp.verified_at, sp.created_at, sp.updated_at
         FROM catalog.seller_profiles sp
         WHERE sp.user_id = $1`,
        [userId],
      );
      const applications = await db.query(
        `SELECT id, user_id, requested_display_name, seller_type, description,
                contact_phone, status, rejection_reason, created_at, updated_at
         FROM catalog.seller_applications
         WHERE user_id = $1
         ORDER BY created_at`,
        [userId],
      );
      const sellerIds = sellerProfiles.rows.map((row) => row.id);
      const bazaars = sellerIds.length === 0
        ? { rows: [] }
        : await db.query(
          `SELECT id, owner_seller_id, name, description, status, address_line,
                  city, state, postal_code, starts_at, ends_at, created_at, updated_at
           FROM catalog.bazaars
           WHERE owner_seller_id = ANY($1::uuid[])
           ORDER BY created_at`,
          [sellerIds],
        );
      const products = sellerIds.length === 0
        ? { rows: [] }
        : await db.query(
          `SELECT id, seller_id, bazaar_id, category_id, name, description,
                  condition, price_cents, currency, status, created_at,
                  updated_at, published_at, removed_at
           FROM catalog.products
           WHERE seller_id = ANY($1::uuid[])
           ORDER BY created_at`,
          [sellerIds],
        );
      const wishlist = await db.query(
        `SELECT wi.product_id, wi.created_at, p.name AS product_name
         FROM catalog.wishlist_items wi
         LEFT JOIN catalog.products p ON p.id = wi.product_id
         WHERE wi.user_id = $1
         ORDER BY wi.created_at DESC`,
        [userId],
      );

      res.json({
        data: {
          role_projection: projection.rows[0] || null,
          seller_profiles: sellerProfiles.rows,
          seller_applications: applications.rows,
          bazaars: bazaars.rows,
          products: products.rows,
          wishlist: wishlist.rows,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/privacy/users/:userId/anonymize', async (req, res, next) => {
    try {
      const userId = parse(UserIdSchema, req.params.userId);
      const result = await db.transaction(async (client) => {
        const buyerReservations = await client.query(
          `SELECT order_id
           FROM catalog.inventory_reservations
           WHERE buyer_id = $1 AND status = 'active'
           FOR UPDATE`,
          [userId],
        );
        for (const reservation of buyerReservations.rows) {
          await releaseInventoryWithClient(
            client,
            reservation.order_id,
            req.correlationId,
            { allowMissing: true },
          );
        }
        await client.query(
          `UPDATE catalog.inventory_reservations
           SET buyer_id = md5($1::text)::uuid, updated_at = now()
           WHERE buyer_id = $1`,
          [userId],
        );
        await client.query(
          `UPDATE catalog.inventory_reservation_items
           SET seller_user_id = md5($1::text)::uuid,
               seller_name = 'Vendedor eliminado'
           WHERE seller_user_id = $1`,
          [userId],
        );
        const sellerProfiles = await client.query(
          `SELECT id FROM catalog.seller_profiles WHERE user_id = $1`,
          [userId],
        );
        const sellerIds = sellerProfiles.rows.map((row) => row.id);

        if (sellerIds.length > 0) {
          await client.query(
            `UPDATE catalog.products
             SET status = 'removed', removed_at = COALESCE(removed_at, now()), updated_at = now()
             WHERE seller_id = ANY($1::uuid[])`,
            [sellerIds],
          );
          await client.query(
            `UPDATE catalog.bazaars
             SET status = 'archived', name = 'Bazar eliminado', description = NULL,
                 address_line = NULL, city = NULL, state = NULL, postal_code = NULL,
                 updated_at = now()
             WHERE owner_seller_id = ANY($1::uuid[])`,
            [sellerIds],
          );
          await client.query(
            `UPDATE catalog.seller_profiles
             SET display_name = 'Vendedor eliminado', description = NULL, phone = NULL,
                 address_line = NULL, city = NULL, state = NULL, postal_code = NULL,
                 status = 'suspended', updated_at = now()
             WHERE id = ANY($1::uuid[])`,
            [sellerIds],
          );
        }

        await client.query('DELETE FROM catalog.wishlist_items WHERE user_id = $1', [userId]);
        await client.query(
          `UPDATE catalog.seller_applications
           SET requested_display_name = 'Vendedor eliminado', description = NULL,
               contact_phone = NULL, rejection_reason = NULL, reviewed_by = NULL,
               updated_at = now()
           WHERE user_id = $1`,
          [userId],
        );
        await client.query(
          `UPDATE catalog.files
           SET uploaded_by = NULL, original_name = NULL
           WHERE uploaded_by = $1`,
          [userId],
        );
        await client.query(
          `UPDATE catalog.user_role_projection
           SET is_active = false, full_name = NULL, updated_at = now()
           WHERE user_id = $1`,
          [userId],
        );

        return {
          seller_profiles: sellerIds.length,
          deleted_wishlist_items: true,
        };
      });
      res.json({ service: 'catalog', status: 'completed', result });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw createHttpError('Invalid request', 400, result.error.flatten?.() || result.error.issues);
  }
  return result.data;
}

module.exports = { createInternalRouter };
