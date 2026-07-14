CREATE TABLE user_role_projection (
  user_id uuid PRIMARY KEY,
  role varchar(30) NOT NULL CHECK (role IN ('cliente', 'vendedor', 'admin')),
  is_active boolean NOT NULL DEFAULT true,
  full_name varchar(180),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_provider varchar(40) NOT NULL DEFAULT 'local'
    CHECK (storage_provider IN ('local', 's3', 'cloudflare_r2', 'supabase_storage', 'other')),
  bucket varchar(120) NOT NULL,
  object_key varchar(700) NOT NULL,
  original_name varchar(255),
  mime_type varchar(120) NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  checksum_sha256 char(64),
  visibility varchar(30) NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'public_read', 'signed_url')),
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT files_image_mime_chk CHECK (
    mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')
  ),
  CONSTRAINT files_unique_object UNIQUE (storage_provider, bucket, object_key)
);

CREATE TABLE seller_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES user_role_projection(user_id) ON DELETE CASCADE,
  seller_type varchar(30) NOT NULL DEFAULT 'person'
    CHECK (seller_type IN ('person', 'store', 'bazar')),
  display_name varchar(180) NOT NULL,
  description text,
  status varchar(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  phone varchar(30),
  address_line varchar(255),
  city varchar(120),
  state varchar(120),
  postal_code varchar(20),
  profile_image_file_id uuid REFERENCES files(id) ON DELETE SET NULL,
  rating_average numeric(3,2) NOT NULL DEFAULT 0
    CHECK (rating_average >= 0 AND rating_average <= 5),
  total_sales integer NOT NULL DEFAULT 0 CHECK (total_sales >= 0),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE seller_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  requested_display_name varchar(180) NOT NULL,
  seller_type varchar(30) NOT NULL DEFAULT 'person'
    CHECK (seller_type IN ('person', 'store', 'bazar')),
  description text,
  contact_phone varchar(30),
  status varchar(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  reviewed_by uuid,
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
  status varchar(30) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived', 'cancelled')),
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
  condition varchar(30) NOT NULL
    CHECK (condition IN ('nuevo', 'como nuevo', 'buen estado', 'usado', 'muy usado')),
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'MXN',
  status varchar(30) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'sold', 'removed')),
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

CREATE TABLE inventory_reservations (
  order_id uuid PRIMARY KEY,
  buyer_id uuid NOT NULL,
  request_fingerprint char(64) NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'confirmed', 'released')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  released_at timestamptz
);

CREATE TABLE inventory_reservation_items (
  order_id uuid NOT NULL REFERENCES inventory_reservations(order_id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  seller_user_id uuid NOT NULL,
  product_name varchar(180) NOT NULL,
  size_name varchar(40) NOT NULL,
  seller_name varchar(180) NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  currency char(3) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, variant_id)
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

CREATE OR REPLACE FUNCTION validate_product_seller()
RETURNS trigger AS $$
DECLARE
  projected_role varchar(30);
  projected_active boolean;
  profile_status varchar(30);
BEGIN
  SELECT ur.role, ur.is_active, sp.status
    INTO projected_role, projected_active, profile_status
  FROM seller_profiles sp
  JOIN user_role_projection ur ON ur.user_id = sp.user_id
  WHERE sp.id = NEW.seller_id;

  IF projected_role <> 'vendedor' OR projected_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Only active users with role vendedor can publish products';
  END IF;
  IF profile_status <> 'approved' THEN
    RAISE EXCEPTION 'Seller must be approved before publishing products';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER seller_profiles_touch_updated_at
BEFORE UPDATE ON seller_profiles
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER seller_applications_touch_updated_at
BEFORE UPDATE ON seller_applications
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER bazaars_touch_updated_at
BEFORE UPDATE ON bazaars
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER products_touch_updated_at
BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER product_variants_touch_updated_at
BEFORE UPDATE ON product_variants
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER inventory_reservations_touch_updated_at
BEFORE UPDATE ON inventory_reservations
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER products_validate_seller
BEFORE INSERT OR UPDATE OF seller_id, status ON products
FOR EACH ROW EXECUTE FUNCTION validate_product_seller();

CREATE UNIQUE INDEX product_images_one_cover_idx ON product_images (product_id) WHERE is_cover;
CREATE INDEX files_uploaded_by_idx ON files (uploaded_by);
CREATE INDEX seller_profiles_status_idx ON seller_profiles (status);
CREATE INDEX seller_profiles_user_idx ON seller_profiles (user_id);
CREATE INDEX seller_applications_status_idx ON seller_applications (status);
CREATE INDEX bazaars_status_idx ON bazaars (status);
CREATE INDEX bazaars_owner_idx ON bazaars (owner_seller_id);
CREATE INDEX products_search_idx ON products USING gin ((name || ' ' || description) gin_trgm_ops);
CREATE INDEX products_status_idx ON products (status);
CREATE INDEX products_seller_idx ON products (seller_id);
CREATE INDEX products_category_idx ON products (category_id);
CREATE INDEX products_bazaar_idx ON products (bazaar_id);
CREATE INDEX products_price_idx ON products (price_cents);
CREATE INDEX products_created_at_idx ON products (created_at);
CREATE INDEX product_variants_product_idx ON product_variants (product_id);
CREATE INDEX inventory_reservations_status_expiry_idx
  ON inventory_reservations (status, expires_at) WHERE status = 'active';
CREATE INDEX inventory_reservation_items_variant_idx ON inventory_reservation_items (variant_id);
CREATE INDEX message_outbox_pending_idx ON message_outbox (created_at) WHERE processed_at IS NULL;
