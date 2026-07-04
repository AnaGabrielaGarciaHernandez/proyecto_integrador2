\set ON_ERROR_STOP on

BEGIN;

CREATE TABLE IF NOT EXISTS product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size_name varchar(40) NOT NULL,
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, size_name)
);

INSERT INTO product_variants (product_id, size_name, stock, created_at, updated_at)
SELECT
  p.id,
  COALESCE(NULLIF(p.size_label, ''), 'Unitalla') AS size_name,
  COALESCE(p.stock, 0) AS stock,
  COALESCE(p.created_at, now()) AS created_at,
  COALESCE(p.updated_at, now()) AS updated_at
FROM products p
WHERE NOT EXISTS (
  SELECT 1
  FROM product_variants pv
  WHERE pv.product_id = p.id
);

ALTER TABLE cart_items
  ADD COLUMN IF NOT EXISTS variant_id uuid;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'cart_items'
      AND column_name = 'product_id'
  ) THEN
    ALTER TABLE cart_items
      ALTER COLUMN product_id DROP NOT NULL;
  END IF;
END $$;

UPDATE cart_items ci
SET variant_id = pv.id
FROM product_variants pv
WHERE ci.variant_id IS NULL
  AND ci.product_id = pv.product_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'cart_items'
      AND column_name = 'variant_id'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE cart_items
      ALTER COLUMN variant_id SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cart_items_variant_id_fkey'
  ) THEN
    ALTER TABLE cart_items
      ADD CONSTRAINT cart_items_variant_id_fkey
      FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS product_variants_product_idx ON product_variants (product_id);
CREATE INDEX IF NOT EXISTS cart_items_cart_idx ON cart_items (cart_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cart_items_cart_variant_unique'
  ) THEN
    ALTER TABLE cart_items
      ADD CONSTRAINT cart_items_cart_variant_unique UNIQUE (cart_id, variant_id);
  END IF;
END $$;

COMMIT;
