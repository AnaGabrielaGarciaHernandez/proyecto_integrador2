const path = require('node:path');
const dotenv = require('dotenv');
const { Pool } = require('pg');
const { databaseConfig } = require('./database-config');

dotenv.config({ path: process.env.ENV_FILE || path.resolve(__dirname, '../.env'), quiet: true });
const pool = new Pool(databaseConfig());

const sql = `
DO $$
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'Legacy public.users was not found. Apply the legacy schema or skip data migration for a fresh database.';
  END IF;
END $$;

SELECT pg_advisory_xact_lock(hashtext('ecobazar_legacy_microservices_migration'));

INSERT INTO identity.users
  (id, email, full_name, password_hash, auth_provider, google_sub, google_email_verified,
   role, phone, bio, avatar_file_id, stripe_customer_id, is_active, email_verified_at,
   last_login_at, created_at, updated_at)
SELECT id, email, full_name, password_hash, auth_provider::text::identity.auth_provider,
       google_sub, google_email_verified, role::text::identity.user_role, phone, bio,
       avatar_file_id, stripe_customer_id, is_active, email_verified_at, last_login_at,
       created_at, updated_at
FROM public.users
ON CONFLICT (id) DO NOTHING;

INSERT INTO catalog.user_role_projection (user_id, role, is_active, full_name, updated_at)
SELECT id, role::text, is_active, full_name, updated_at FROM public.users
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO catalog.files
  (id, storage_provider, bucket, object_key, original_name, mime_type, size_bytes,
   checksum_sha256, visibility, uploaded_by, created_at)
SELECT id, storage_provider::text, bucket, object_key, original_name, mime_type, size_bytes,
       checksum_sha256, visibility::text, uploaded_by, created_at
FROM public.files ON CONFLICT (id) DO NOTHING;

INSERT INTO catalog.seller_profiles
  (id, user_id, seller_type, display_name, description, status, phone, address_line,
   city, state, postal_code, profile_image_file_id, rating_average, total_sales,
   verified_at, created_at, updated_at)
SELECT id, user_id, seller_type::text, display_name, description, status::text, phone,
       address_line, city, state, postal_code, profile_image_file_id, rating_average,
       total_sales, verified_at, created_at, updated_at
FROM public.seller_profiles ON CONFLICT (id) DO NOTHING;

INSERT INTO catalog.seller_applications
  (id, user_id, requested_display_name, seller_type, description, contact_phone,
   status, reviewed_by, reviewed_at, rejection_reason, created_at, updated_at)
SELECT id, user_id, requested_display_name, seller_type::text, description, contact_phone,
       status::text, reviewed_by, reviewed_at, rejection_reason, created_at, updated_at
FROM public.seller_applications ON CONFLICT (id) DO NOTHING;

INSERT INTO catalog.bazaars
  (id, owner_seller_id, name, description, status, cover_file_id, address_line,
   city, state, postal_code, starts_at, ends_at, created_at, updated_at)
SELECT id, owner_seller_id, name, description, status::text, cover_file_id, address_line,
       city, state, postal_code, starts_at, ends_at, created_at, updated_at
FROM public.bazaars ON CONFLICT (id) DO NOTHING;

INSERT INTO catalog.bazaar_members (bazaar_id, seller_id, created_at)
SELECT bazaar_id, seller_id, created_at FROM public.bazaar_members
ON CONFLICT (bazaar_id, seller_id) DO NOTHING;

INSERT INTO catalog.categories (id, name, slug, is_active, created_at)
SELECT id, name, slug, is_active, created_at FROM public.categories
ON CONFLICT (id) DO NOTHING;

-- Historical products must be preserved even if their seller was suspended or
-- deactivated after publishing. Runtime writes re-enable this Catalog rule.
ALTER TABLE catalog.products DISABLE TRIGGER products_validate_seller;

INSERT INTO catalog.products
  (id, seller_id, bazaar_id, category_id, name, description, condition, price_cents,
   currency, status, created_at, updated_at, published_at, removed_at)
SELECT id, seller_id, bazaar_id, category_id, name, description, condition::text,
       price_cents, currency, status::text, created_at, updated_at, published_at, removed_at
FROM public.products ON CONFLICT (id) DO NOTHING;

ALTER TABLE catalog.products ENABLE TRIGGER products_validate_seller;

INSERT INTO catalog.product_variants (id, product_id, size_name, stock, created_at, updated_at)
SELECT id, product_id, size_name, stock, created_at, updated_at
FROM public.product_variants ON CONFLICT (id) DO NOTHING;

INSERT INTO catalog.product_images (id, product_id, file_id, sort_order, is_cover, created_at)
SELECT id, product_id, file_id, sort_order, is_cover, created_at
FROM public.product_images ON CONFLICT (id) DO NOTHING;

INSERT INTO cart.shopping_carts (id, buyer_id, created_at, updated_at)
SELECT id, user_id, created_at, updated_at FROM public.shopping_carts
ON CONFLICT (id) DO NOTHING;

INSERT INTO cart.cart_items
  (id, cart_id, variant_id, product_id, seller_id, seller_user_id, product_name,
   size_name, seller_name, quantity, unit_price_cents, currency, stock_snapshot,
   product_status, cover_image, created_at, updated_at)
SELECT ci.id, ci.cart_id, ci.variant_id, p.id, sp.id, sp.user_id, p.name,
       pv.size_name, sp.display_name, ci.quantity, ci.unit_price_cents, p.currency,
       pv.stock, p.status::text, cover.image, ci.created_at, ci.updated_at
FROM public.cart_items ci
JOIN public.product_variants pv ON pv.id = ci.variant_id
JOIN public.products p ON p.id = pv.product_id
JOIN public.seller_profiles sp ON sp.id = p.seller_id
LEFT JOIN LATERAL (
  SELECT jsonb_build_object('id', pi.id, 'file_id', f.id,
    'url', '/' || f.bucket || '/' || f.object_key, 'mime_type', f.mime_type) AS image
  FROM public.product_images pi JOIN public.files f ON f.id = pi.file_id
  WHERE pi.product_id = p.id
  ORDER BY pi.is_cover DESC, pi.sort_order, pi.created_at LIMIT 1
) cover ON true
ON CONFLICT (id) DO NOTHING;

INSERT INTO ordering.orders
  (id, order_number, buyer_id, buyer_name, status, subtotal_cents, total_cents,
   currency, payment_status, stripe_receipt_url, checkout_session_id,
   pickup_scheduled_at, checkout_expires_at, paid_at, cancelled_at, created_at, updated_at)
SELECT o.id, o.order_number, o.buyer_id, u.full_name,
       o.status::text::ordering.order_status, o.subtotal_cents, o.total_cents,
       o.currency, COALESCE(p.status::text, 'pending'), p.stripe_receipt_url,
       p.stripe_checkout_session_id,
       NULLIF(to_jsonb(o)->>'pickup_scheduled_at', '')::timestamptz,
       o.checkout_expires_at,
       o.paid_at, o.cancelled_at, o.created_at, o.updated_at
FROM public.orders o
JOIN public.users u ON u.id = o.buyer_id
LEFT JOIN public.payments p ON p.order_id = o.id
ON CONFLICT (id) DO NOTHING;

INSERT INTO ordering.order_items
  (id, order_id, variant_id, product_id, seller_id, seller_user_id, product_name,
   size_name, quantity, unit_price_cents, total_cents, created_at)
SELECT oi.id, oi.order_id, pv.id,
       COALESCE(NULLIF(to_jsonb(oi)->>'product_id', '')::uuid, pv.product_id),
       oi.seller_id, sp.user_id,
       oi.product_name,
       COALESCE(NULLIF(to_jsonb(oi)->>'size_name', ''), pv.size_name, 'N/A'),
       oi.quantity, oi.unit_price_cents, oi.total_cents,
       oi.created_at
FROM public.order_items oi
LEFT JOIN LATERAL (
  SELECT candidate.*
  FROM public.product_variants candidate
  WHERE candidate.id = NULLIF(to_jsonb(oi)->>'variant_id', '')::uuid
     OR (
       NULLIF(to_jsonb(oi)->>'variant_id', '') IS NULL
       AND candidate.product_id = NULLIF(to_jsonb(oi)->>'product_id', '')::uuid
     )
  ORDER BY (candidate.id = NULLIF(to_jsonb(oi)->>'variant_id', '')::uuid) DESC,
           candidate.created_at, candidate.id
  LIMIT 1
) pv ON true
JOIN public.seller_profiles sp ON sp.id = oi.seller_id
ON CONFLICT (id) DO NOTHING;

INSERT INTO ordering.checkout_sagas (order_id, status, correlation_id, created_at, updated_at)
SELECT o.id,
       CASE
         WHEN o.status = 'pending_payment'
          AND COALESCE(o.checkout_expires_at, o.created_at + interval '30 minutes') <= now()
           THEN 'compensation_pending'
         WHEN o.status = 'pending_payment' AND p.stripe_checkout_session_id IS NOT NULL THEN 'payment_session_created'
         WHEN o.status = 'pending_payment' THEN 'inventory_reserved'
         WHEN o.status = 'cancelled' THEN 'compensated'
         ELSE 'paid'
       END::ordering.saga_status,
       gen_random_uuid(), o.created_at, o.updated_at
FROM public.orders o LEFT JOIN public.payments p ON p.order_id = o.id
ON CONFLICT (order_id) DO NOTHING;

INSERT INTO catalog.inventory_reservations
  (order_id, buyer_id, request_fingerprint, status, expires_at, created_at, updated_at)
SELECT o.id, o.buyer_id,
       encode(digest(o.id::text || ':' || o.total_cents::text, 'sha256'), 'hex'),
       'active', COALESCE(o.checkout_expires_at, o.created_at + interval '30 minutes'),
       o.created_at, o.updated_at
FROM public.orders o WHERE o.status = 'pending_payment'
ON CONFLICT (order_id) DO NOTHING;

INSERT INTO catalog.inventory_reservation_items
  (order_id, variant_id, product_id, seller_id, seller_user_id, product_name,
   size_name, seller_name, quantity, unit_price_cents, currency, created_at)
SELECT oi.order_id, pv.id, pv.product_id, oi.seller_id, sp.user_id,
       oi.product_name,
       COALESCE(NULLIF(to_jsonb(oi)->>'size_name', ''), pv.size_name, 'N/A'),
       sp.display_name, oi.quantity,
       oi.unit_price_cents, o.currency, oi.created_at
FROM public.order_items oi
JOIN public.orders o ON o.id = oi.order_id AND o.status = 'pending_payment'
JOIN LATERAL (
  SELECT candidate.*
  FROM public.product_variants candidate
  WHERE candidate.id = NULLIF(to_jsonb(oi)->>'variant_id', '')::uuid
     OR (
       NULLIF(to_jsonb(oi)->>'variant_id', '') IS NULL
       AND candidate.product_id = NULLIF(to_jsonb(oi)->>'product_id', '')::uuid
     )
  ORDER BY (candidate.id = NULLIF(to_jsonb(oi)->>'variant_id', '')::uuid) DESC,
           candidate.created_at, candidate.id
  LIMIT 1
) pv ON true
JOIN public.seller_profiles sp ON sp.id = oi.seller_id
ON CONFLICT (order_id, variant_id) DO NOTHING;

INSERT INTO payment.payments
  (id, order_id, buyer_id, provider, status, amount_cents, currency,
   stripe_checkout_session_id, stripe_payment_intent_id, stripe_charge_id,
   stripe_receipt_url, checkout_expires_at, failure_code, failure_message,
   raw_event, created_at, updated_at)
SELECT p.id, p.order_id, o.buyer_id, p.provider,
       p.status::text::payment.payment_status, p.amount_cents, p.currency,
       p.stripe_checkout_session_id, p.stripe_payment_intent_id, p.stripe_charge_id,
       p.stripe_receipt_url, o.checkout_expires_at, p.failure_code, p.failure_message,
       p.raw_event, p.created_at, p.updated_at
FROM public.payments p JOIN public.orders o ON o.id = p.order_id
ON CONFLICT (id) DO NOTHING;

INSERT INTO moderation.reports
  (id, reporter_id, target_type, target_id, reason, description, status,
   reviewed_by, reviewed_at, resolution_notes, created_at, updated_at)
SELECT id, reporter_id, target_type::text, target_id, reason, description,
       status::text, reviewed_by, reviewed_at, resolution_notes, created_at, updated_at
FROM public.reports ON CONFLICT (id) DO NOTHING;

DO $copy_optional_reviews$
BEGIN
  IF to_regclass('public.reviews') IS NOT NULL THEN
    EXECUTE $copy$
      INSERT INTO moderation.reviews
        (id, order_id, buyer_id, seller_id, rating, comment, created_at, updated_at)
      SELECT id, order_id, buyer_id, seller_id, rating, comment, created_at, updated_at
      FROM public.reviews ON CONFLICT (id) DO NOTHING
    $copy$;
  END IF;
END
$copy_optional_reviews$;

INSERT INTO moderation.admin_actions
  (id, admin_id, action, target_table, target_id, notes, created_at)
SELECT id, admin_id, action, target_table, target_id, notes, created_at
FROM public.admin_actions ON CONFLICT (id) DO NOTHING;

SELECT setval(
  'ordering.order_number_seq',
  GREATEST(last_number, 1),
  last_number > 0
)
FROM (
  SELECT COALESCE(
    max((regexp_match(order_number, '([0-9]+)$'))[1]::bigint),
    0
  ) AS last_number
  FROM ordering.orders
) sequence_state;
`;

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('[migration] legacy public data copied to service schemas');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[migration] legacy data copy failed', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
