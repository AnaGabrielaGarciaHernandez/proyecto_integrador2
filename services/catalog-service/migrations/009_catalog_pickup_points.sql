CREATE TABLE seller_pickup_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES seller_profiles(id) ON DELETE CASCADE,
  name varchar(160) NOT NULL,
  address_line varchar(255) NOT NULL,
  city varchar(120) NOT NULL,
  state varchar(120) NOT NULL,
  postal_code varchar(20) NOT NULL,
  reference varchar(255),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_pickup_points_name_chk CHECK (char_length(btrim(name)) > 0),
  CONSTRAINT seller_pickup_points_address_chk CHECK (char_length(btrim(address_line)) > 0),
  CONSTRAINT seller_pickup_points_city_chk CHECK (char_length(btrim(city)) > 0),
  CONSTRAINT seller_pickup_points_state_chk CHECK (char_length(btrim(state)) > 0),
  CONSTRAINT seller_pickup_points_postal_chk CHECK (char_length(btrim(postal_code)) > 0)
);

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS pickup_point_id uuid
    REFERENCES seller_pickup_points(id) ON DELETE SET NULL;

CREATE TABLE product_pickup_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time time NOT NULL,
  end_time time NOT NULL,
  timezone varchar(64) NOT NULL DEFAULT 'America/Monterrey',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_pickup_schedules_timezone_chk CHECK (timezone = 'America/Monterrey'),
  CONSTRAINT product_pickup_schedules_time_chk CHECK (end_time > start_time),
  CONSTRAINT product_pickup_schedules_unique_window
    UNIQUE (product_id, day_of_week, start_time, end_time)
);

ALTER TABLE inventory_reservation_items
  ADD COLUMN IF NOT EXISTS pickup_point_id uuid
    REFERENCES seller_pickup_points(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pickup_point_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS pickup_schedules jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION validate_product_pickup_point()
RETURNS trigger AS $$
DECLARE
  point_seller_id uuid;
BEGIN
  IF NEW.pickup_point_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT seller_id
    INTO point_seller_id
  FROM seller_pickup_points
  WHERE id = NEW.pickup_point_id;

  IF point_seller_id IS NULL OR point_seller_id <> NEW.seller_id THEN
    RAISE EXCEPTION 'Pickup point must belong to the product seller';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_active_product_pickup_configuration()
RETURNS trigger AS $$
DECLARE
  point_active boolean;
  schedule_count integer;
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  IF NEW.pickup_point_id IS NULL THEN
    RAISE EXCEPTION 'Active products require a pickup point';
  END IF;

  SELECT is_active
    INTO point_active
  FROM seller_pickup_points
  WHERE id = NEW.pickup_point_id;

  IF point_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Active products require an active pickup point';
  END IF;

  SELECT count(*)
    INTO schedule_count
  FROM product_pickup_schedules
  WHERE product_id = NEW.id;

  IF schedule_count = 0 THEN
    RAISE EXCEPTION 'Active products require at least one pickup schedule';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_product_schedule_point()
RETURNS trigger AS $$
DECLARE
  product_seller_id uuid;
  point_seller_id uuid;
BEGIN
  SELECT seller_id, pickup_point_id
    INTO product_seller_id, point_seller_id
  FROM products
  WHERE id = NEW.product_id;

  IF product_seller_id IS NULL THEN
    RAISE EXCEPTION 'Pickup schedule product does not exist';
  END IF;

  IF point_seller_id IS NULL THEN
    RAISE EXCEPTION 'Pickup schedules require a product pickup point';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER seller_pickup_points_touch_updated_at
BEFORE UPDATE ON seller_pickup_points
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER product_pickup_schedules_touch_updated_at
BEFORE UPDATE ON product_pickup_schedules
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER products_validate_pickup_point
BEFORE INSERT OR UPDATE OF seller_id, pickup_point_id ON products
FOR EACH ROW EXECUTE FUNCTION validate_product_pickup_point();

CREATE TRIGGER products_validate_active_pickup_configuration
BEFORE UPDATE OF status ON products
FOR EACH ROW EXECUTE FUNCTION validate_active_product_pickup_configuration();

CREATE TRIGGER product_pickup_schedules_validate_point
BEFORE INSERT OR UPDATE OF product_id ON product_pickup_schedules
FOR EACH ROW EXECUTE FUNCTION validate_product_schedule_point();

CREATE INDEX seller_pickup_points_seller_idx
  ON seller_pickup_points (seller_id, is_active, created_at DESC);
CREATE INDEX products_pickup_point_idx
  ON products (pickup_point_id);
CREATE INDEX product_pickup_schedules_product_day_idx
  ON product_pickup_schedules (product_id, day_of_week, start_time);
CREATE INDEX inventory_reservation_items_pickup_point_idx
  ON inventory_reservation_items (pickup_point_id);
