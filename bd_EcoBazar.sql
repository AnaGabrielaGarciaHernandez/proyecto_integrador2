-- EcoBazar database source schema
-- Database name: bd_EcoBazar
--
-- Run with:
--   psql -d postgres -f bd_EcoBazar.sql

\set ON_ERROR_STOP on

SELECT 'CREATE DATABASE "bd_EcoBazar"'
WHERE NOT EXISTS (
  SELECT 1 FROM pg_database WHERE datname = 'bd_EcoBazar'
)\gexec

\connect "bd_EcoBazar"

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE user_role AS ENUM ('cliente', 'vendedor', 'admin');
CREATE TYPE auth_provider AS ENUM ('email', 'google');
CREATE TYPE seller_status AS ENUM ('pending', 'approved', 'rejected', 'suspended');
CREATE TYPE seller_type AS ENUM ('person', 'store', 'bazar');
CREATE TYPE bazaar_status AS ENUM ('draft', 'published', 'archived', 'cancelled');
CREATE TYPE product_condition AS ENUM ('nuevo', 'como nuevo', 'buen estado', 'usado', 'muy usado');
CREATE TYPE product_status AS ENUM ('draft', 'active', 'paused', 'sold', 'removed');
CREATE TYPE order_status AS ENUM ('pending_payment', 'paid', 'preparing', 'ready_for_pickup', 'delivered', 'cancelled', 'refunded');
CREATE TYPE payment_status AS ENUM ('pending', 'requires_action', 'succeeded', 'failed', 'cancelled', 'refunded');
CREATE TYPE report_status AS ENUM ('pending', 'reviewing', 'resolved', 'dismissed');
CREATE TYPE report_target_type AS ENUM ('product', 'seller', 'bazaar', 'user');
CREATE TYPE storage_provider AS ENUM ('local', 's3', 'cloudflare_r2', 'supabase_storage', 'other');
CREATE TYPE file_visibility AS ENUM ('private', 'public_read', 'signed_url');

CREATE TABLE files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_provider storage_provider NOT NULL DEFAULT 'local',
  bucket varchar(120) NOT NULL,
  object_key varchar(700) NOT NULL,
  original_name varchar(255),
  mime_type varchar(120) NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  checksum_sha256 char(64),
  visibility file_visibility NOT NULL DEFAULT 'private',
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT files_image_mime_chk CHECK (
    mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')
  ),
  CONSTRAINT files_unique_object UNIQUE (storage_provider, bucket, object_key)
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(255) NOT NULL,
  full_name varchar(180) NOT NULL,
  password_hash varchar(255),
  auth_provider auth_provider NOT NULL,
  google_sub varchar(255),
  google_email_verified boolean NOT NULL DEFAULT false,
  role user_role NOT NULL DEFAULT 'cliente',
  phone varchar(30),
  bio text,
  avatar_file_id uuid REFERENCES files(id) ON DELETE SET NULL,
  stripe_customer_id varchar(255),
  is_active boolean NOT NULL DEFAULT true,
  email_verified_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_format_chk CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  CONSTRAINT users_email_auth_chk CHECK (
    (auth_provider = 'email' AND password_hash IS NOT NULL AND google_sub IS NULL)
    OR
    (auth_provider = 'google' AND google_sub IS NOT NULL)
  )
);

ALTER TABLE files
  ADD CONSTRAINT files_uploaded_by_fkey
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX users_email_unique_idx ON users (lower(email));
CREATE UNIQUE INDEX users_google_sub_unique_idx ON users (google_sub) WHERE google_sub IS NOT NULL;
CREATE UNIQUE INDEX users_stripe_customer_unique_idx ON users (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX users_role_idx ON users (role);
CREATE INDEX users_created_at_idx ON users (created_at);

CREATE TABLE seller_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  seller_type seller_type NOT NULL DEFAULT 'person',
  display_name varchar(180) NOT NULL,
  description text,
  status seller_status NOT NULL DEFAULT 'pending',
  phone varchar(30),
  address_line varchar(255),
  city varchar(120),
  state varchar(120),
  postal_code varchar(20),
  profile_image_file_id uuid REFERENCES files(id) ON DELETE SET NULL,
  rating_average numeric(3,2) NOT NULL DEFAULT 0 CHECK (rating_average >= 0 AND rating_average <= 5),
  total_sales integer NOT NULL DEFAULT 0 CHECK (total_sales >= 0),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE seller_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_display_name varchar(180) NOT NULL,
  seller_type seller_type NOT NULL DEFAULT 'person',
  description text,
  contact_phone varchar(30),
  status seller_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bazaars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_seller_id uuid NOT NULL REFERENCES seller_profiles(id) ON DELETE CASCADE,
  name varchar(180) NOT NULL,
  description text,
  status bazaar_status NOT NULL DEFAULT 'draft',
  cover_file_id uuid REFERENCES files(id) ON DELETE SET NULL,
  address_line varchar(255),
  city varchar(120),
  state varchar(120),
  postal_code varchar(20),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bazaars_dates_chk CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at >= starts_at)
);

CREATE TABLE bazaar_members (
  bazaar_id uuid NOT NULL REFERENCES bazaars(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES seller_profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bazaar_id, seller_id)
);

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL UNIQUE,
  slug varchar(140) NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES seller_profiles(id) ON DELETE RESTRICT,
  bazaar_id uuid REFERENCES bazaars(id) ON DELETE SET NULL,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  name varchar(180) NOT NULL,
  description text NOT NULL,
  condition product_condition NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'MXN',
  status product_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  removed_at timestamptz
);

CREATE TABLE product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size_name varchar(40) NOT NULL,
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, size_name)
);

CREATE TABLE product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_cover boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, file_id)
);

CREATE UNIQUE INDEX product_images_one_cover_idx ON product_images (product_id) WHERE is_cover;
CREATE INDEX products_search_idx ON products USING gin ((name || ' ' || description) gin_trgm_ops);
CREATE INDEX products_status_idx ON products (status);
CREATE INDEX products_seller_idx ON products (seller_id);
CREATE INDEX products_category_idx ON products (category_id);
CREATE INDEX products_bazaar_idx ON products (bazaar_id);
CREATE INDEX products_price_idx ON products (price_cents);
CREATE INDEX products_created_at_idx ON products (created_at);
CREATE INDEX product_variants_product_idx ON product_variants (product_id);

CREATE TABLE shopping_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES shopping_carts(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cart_id, variant_id)
);

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number varchar(30) NOT NULL UNIQUE,
  buyer_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status order_status NOT NULL DEFAULT 'pending_payment',
  subtotal_cents integer NOT NULL CHECK (subtotal_cents >= 0),
  total_cents integer NOT NULL CHECK (total_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'MXN',
  pickup_scheduled_at timestamptz,
  checkout_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  cancelled_at timestamptz
);

CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES product_variants(id) ON DELETE SET NULL,
  seller_id uuid NOT NULL REFERENCES seller_profiles(id) ON DELETE RESTRICT,
  product_name varchar(180) NOT NULL,
  size_name varchar(40) NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  total_cents integer NOT NULL CHECK (total_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  provider varchar(40) NOT NULL DEFAULT 'stripe',
  status payment_status NOT NULL DEFAULT 'pending',
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'MXN',
  stripe_checkout_session_id varchar(255),
  stripe_payment_intent_id varchar(255),
  stripe_charge_id varchar(255),
  stripe_receipt_url text,
  failure_code varchar(100),
  failure_message text,
  raw_event jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_provider_chk CHECK (provider = 'stripe')
);

CREATE UNIQUE INDEX payments_stripe_session_unique_idx ON payments (stripe_checkout_session_id) WHERE stripe_checkout_session_id IS NOT NULL;
CREATE UNIQUE INDEX payments_stripe_intent_unique_idx ON payments (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type report_target_type NOT NULL,
  target_id uuid NOT NULL,
  reason varchar(160) NOT NULL,
  description text,
  status report_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES seller_profiles(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, buyer_id, seller_id)
);

CREATE TABLE admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action varchar(120) NOT NULL,
  target_table varchar(120) NOT NULL,
  target_id uuid NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE SEQUENCE order_number_seq START WITH 1 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_cart_for_new_cliente()
RETURNS trigger AS $$
BEGIN
  IF NEW.role = 'cliente' THEN
    INSERT INTO shopping_carts (user_id) VALUES (NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS varchar AS $$
BEGIN
  RETURN 'ECO-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('order_number_seq')::text, 6, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_order_number()
RETURNS trigger AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number = generate_order_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_product_seller()
RETURNS trigger AS $$
DECLARE
  seller_user_role user_role;
  seller_status_value seller_status;
BEGIN
  SELECT u.role, sp.status
    INTO seller_user_role, seller_status_value
  FROM seller_profiles sp
  JOIN users u ON u.id = sp.user_id
  WHERE sp.id = NEW.seller_id;

  IF seller_user_role <> 'vendedor' THEN
    RAISE EXCEPTION 'Only users with role vendedor can publish products';
  END IF;

  IF seller_status_value <> 'approved' THEN
    RAISE EXCEPTION 'Seller must be approved before publishing products';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION refresh_seller_rating_average(target_seller_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE seller_profiles
  SET rating_average = COALESCE(
    (
      SELECT round(avg(rating)::numeric, 2)
      FROM reviews
      WHERE seller_id = target_seller_id
    ),
    0
  )
  WHERE id = target_seller_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION refresh_seller_rating_average_from_review()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_seller_rating_average(OLD.seller_id);
    RETURN OLD;
  END IF;

  PERFORM refresh_seller_rating_average(NEW.seller_id);

  IF TG_OP = 'UPDATE' AND OLD.seller_id IS DISTINCT FROM NEW.seller_id THEN
    PERFORM refresh_seller_rating_average(OLD.seller_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER users_create_cart
AFTER INSERT ON users
FOR EACH ROW EXECUTE FUNCTION create_cart_for_new_cliente();

CREATE TRIGGER seller_profiles_updated_at
BEFORE UPDATE ON seller_profiles
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER seller_applications_updated_at
BEFORE UPDATE ON seller_applications
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER bazaars_updated_at
BEFORE UPDATE ON bazaars
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER products_updated_at
BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER products_validate_seller
BEFORE INSERT OR UPDATE OF seller_id, status ON products
FOR EACH ROW EXECUTE FUNCTION validate_product_seller();

CREATE TRIGGER product_variants_updated_at
BEFORE UPDATE ON product_variants
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER shopping_carts_updated_at
BEFORE UPDATE ON shopping_carts
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER cart_items_updated_at
BEFORE UPDATE ON cart_items
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER orders_updated_at
BEFORE UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER orders_set_number
BEFORE INSERT ON orders
FOR EACH ROW EXECUTE FUNCTION set_order_number();

CREATE TRIGGER payments_updated_at
BEFORE UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER reports_updated_at
BEFORE UPDATE ON reports
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER reviews_updated_at
BEFORE UPDATE ON reviews
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER reviews_refresh_seller_rating
AFTER INSERT OR UPDATE OR DELETE ON reviews
FOR EACH ROW EXECUTE FUNCTION refresh_seller_rating_average_from_review();

CREATE INDEX files_uploaded_by_idx ON files (uploaded_by);
CREATE INDEX seller_profiles_status_idx ON seller_profiles (status);
CREATE INDEX seller_profiles_user_idx ON seller_profiles (user_id);
CREATE INDEX seller_applications_status_idx ON seller_applications (status);
CREATE INDEX bazaars_status_idx ON bazaars (status);
CREATE INDEX bazaars_owner_idx ON bazaars (owner_seller_id);
CREATE INDEX cart_items_cart_idx ON cart_items (cart_id);
CREATE INDEX orders_buyer_idx ON orders (buyer_id);
CREATE INDEX orders_status_idx ON orders (status);
CREATE UNIQUE INDEX orders_one_pending_payment_per_buyer_idx ON orders (buyer_id) WHERE status = 'pending_payment';
CREATE INDEX order_items_order_idx ON order_items (order_id);
CREATE INDEX order_items_seller_idx ON order_items (seller_id);
CREATE INDEX order_items_variant_idx ON order_items (variant_id);
CREATE INDEX reports_status_idx ON reports (status);
CREATE INDEX reports_target_idx ON reports (target_type, target_id);
CREATE INDEX reviews_seller_idx ON reviews (seller_id);
CREATE INDEX reviews_buyer_idx ON reviews (buyer_id);
CREATE INDEX reviews_order_idx ON reviews (order_id);
CREATE INDEX admin_actions_admin_idx ON admin_actions (admin_id);

INSERT INTO categories (name, slug) VALUES
  ('Sudaderas y chamarras', 'sudaderas-chamarras'),
  ('Camisetas y tops', 'camisetas-tops'),
  ('Pantalones', 'pantalones'),
  ('Vestidos y faldas', 'vestidos-faldas'),
  ('Accesorios', 'accesorios'),
  ('Calzado', 'calzado'),
  ('Hogar y decoracion', 'hogar-decoracion'),
  ('Otros', 'otros');

COMMIT;
