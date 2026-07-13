\set ON_ERROR_STOP on

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS checkout_expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS orders_one_pending_payment_per_buyer_idx
  ON orders (buyer_id)
  WHERE status = 'pending_payment';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'order_status' AND e.enumlabel = 'shipped'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'order_status' AND e.enumlabel = 'ready_for_pickup'
  ) THEN
    ALTER TYPE order_status RENAME VALUE 'shipped' TO 'ready_for_pickup';
  END IF;
END $$;

COMMIT;
