DO $$ BEGIN
  CREATE TYPE payment.payment_status AS ENUM (
    'pending', 'requires_action', 'succeeded', 'failed', 'cancelled', 'refunded'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS payment.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE,
  buyer_id uuid NOT NULL,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  provider varchar(40) NOT NULL DEFAULT 'stripe',
  status payment.payment_status NOT NULL DEFAULT 'pending',
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'MXN',
  stripe_checkout_session_id varchar(255),
  stripe_checkout_url text,
  stripe_payment_intent_id varchar(255),
  stripe_charge_id varchar(255),
  stripe_receipt_url text,
  checkout_expires_at timestamptz,
  failure_code varchar(100),
  failure_message text,
  raw_event jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_provider_chk CHECK (provider = 'stripe'),
  CONSTRAINT payment_currency_chk CHECK (currency = upper(currency))
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_stripe_session_unique_idx
  ON payment.payments (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payment_stripe_intent_unique_idx
  ON payment.payments (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS payment.stripe_events (
  event_id varchar(255) PRIMARY KEY,
  event_type varchar(120) NOT NULL,
  order_id uuid,
  raw_event jsonb NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment.message_outbox (
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

CREATE INDEX IF NOT EXISTS payment_outbox_pending_idx
  ON payment.message_outbox (created_at)
  WHERE processed_at IS NULL;
