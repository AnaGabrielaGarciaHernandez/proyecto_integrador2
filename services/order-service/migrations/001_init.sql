DO $$ BEGIN
  CREATE TYPE ordering.order_status AS ENUM (
    'pending_payment', 'paid', 'preparing', 'ready_for_pickup',
    'delivered', 'cancelled', 'refunded'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ordering.saga_status AS ENUM (
    'created', 'inventory_reserved', 'payment_session_created', 'paid',
    'compensating', 'compensation_pending', 'compensated'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE SEQUENCE IF NOT EXISTS ordering.order_number_seq START WITH 1 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS ordering.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number varchar(30) NOT NULL UNIQUE DEFAULT (
    'ECO-' || to_char(now(), 'YYYY') || '-' ||
    lpad(nextval('ordering.order_number_seq')::text, 6, '0')
  ),
  buyer_id uuid NOT NULL,
  buyer_name varchar(180) NOT NULL DEFAULT 'Cliente',
  status ordering.order_status NOT NULL DEFAULT 'pending_payment',
  subtotal_cents integer NOT NULL CHECK (subtotal_cents >= 0),
  total_cents integer NOT NULL CHECK (total_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'MXN',
  payment_status varchar(40) NOT NULL DEFAULT 'pending',
  stripe_receipt_url text,
  checkout_session_id varchar(255),
  checkout_url text,
  pickup_scheduled_at timestamptz,
  checkout_expires_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ordering_orders_currency_chk CHECK (currency = upper(currency)),
  CONSTRAINT ordering_orders_payment_status_chk CHECK (
    payment_status IN ('pending', 'requires_action', 'succeeded', 'failed', 'cancelled', 'refunded')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ordering_one_pending_payment_per_buyer_idx
  ON ordering.orders (buyer_id)
  WHERE status = 'pending_payment';

CREATE INDEX IF NOT EXISTS ordering_orders_buyer_created_idx
  ON ordering.orders (buyer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ordering.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES ordering.orders(id) ON DELETE CASCADE,
  variant_id uuid,
  product_id uuid,
  seller_id uuid NOT NULL,
  seller_user_id uuid,
  product_name varchar(180) NOT NULL,
  size_name varchar(40) NOT NULL,
  cover_image text,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  total_cents integer NOT NULL CHECK (total_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ordering_items_order_idx
  ON ordering.order_items (order_id, created_at);
CREATE INDEX IF NOT EXISTS ordering_items_seller_user_idx
  ON ordering.order_items (seller_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ordering.checkout_sagas (
  order_id uuid PRIMARY KEY REFERENCES ordering.orders(id) ON DELETE CASCADE,
  status ordering.saga_status NOT NULL DEFAULT 'created',
  correlation_id uuid NOT NULL,
  last_error text,
  compensation_attempts integer NOT NULL DEFAULT 0,
  last_compensation_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ordering_sagas_compensation_pending_idx
  ON ordering.checkout_sagas (updated_at)
  WHERE status = 'compensation_pending';

CREATE TABLE IF NOT EXISTS ordering.message_outbox (
  event_id uuid PRIMARY KEY,
  event_type varchar(120) NOT NULL,
  event_version integer NOT NULL DEFAULT 1,
  correlation_id uuid NOT NULL,
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ordering_outbox_pending_idx
  ON ordering.message_outbox (created_at)
  WHERE processed_at IS NULL;

CREATE TABLE IF NOT EXISTS ordering.message_inbox (
  event_id uuid PRIMARY KEY,
  event_type varchar(120) NOT NULL,
  correlation_id uuid NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);
