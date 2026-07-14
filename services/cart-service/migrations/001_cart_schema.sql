CREATE TABLE shopping_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES shopping_carts(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL,
  product_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  seller_user_id uuid NOT NULL,
  product_name varchar(180) NOT NULL,
  size_name varchar(40) NOT NULL,
  seller_name varchar(180) NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  currency char(3) NOT NULL,
  stock_snapshot integer NOT NULL CHECK (stock_snapshot >= 0),
  product_status varchar(30) NOT NULL,
  cover_image jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cart_id, variant_id)
);

CREATE TABLE message_outbox (
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

CREATE TABLE message_inbox (
  event_id uuid PRIMARY KEY,
  event_type varchar(120) NOT NULL,
  correlation_id uuid NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER shopping_carts_touch_updated_at
BEFORE UPDATE ON shopping_carts
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER cart_items_touch_updated_at
BEFORE UPDATE ON cart_items
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE INDEX cart_items_cart_idx ON cart_items (cart_id);
CREATE INDEX cart_items_variant_idx ON cart_items (variant_id);
CREATE INDEX message_outbox_pending_idx ON message_outbox (created_at) WHERE processed_at IS NULL;
