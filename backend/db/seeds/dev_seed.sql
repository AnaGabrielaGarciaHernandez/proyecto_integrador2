\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  seller_user_id uuid;
  seller_profile_id uuid;
  category_sudaderas uuid;
  category_tops uuid;
  category_pantalones uuid;
  seed_product_id uuid;
BEGIN
  SELECT id INTO seller_user_id
  FROM users
  WHERE lower(email) = 'dev-vendedor@ecobazar.com';

  IF seller_user_id IS NULL THEN
    INSERT INTO users (
      email,
      full_name,
      password_hash,
      auth_provider,
      role,
      email_verified_at
    )
    VALUES (
      'dev-vendedor@ecobazar.com',
      'Vendedor Demo EcoBazar',
      '$2b$12$hilrbNs85TW2BIjU68oYS.F9qUANAcp8sb84bPP1.3HRJqCtWmSo2',
      'email',
      'vendedor',
      now()
    )
    RETURNING id INTO seller_user_id;
  END IF;

  SELECT id INTO seller_profile_id
  FROM seller_profiles
  WHERE user_id = seller_user_id;

  IF seller_profile_id IS NULL THEN
    INSERT INTO seller_profiles (
      user_id,
      seller_type,
      display_name,
      description,
      status,
      city,
      state,
      verified_at
    )
    VALUES (
      seller_user_id,
      'store',
      'EcoBazar Demo',
      'Vendedor de prueba para desarrollo local.',
      'approved',
      'Durango',
      'Durango',
      now()
    )
    RETURNING id INTO seller_profile_id;
  ELSE
    UPDATE seller_profiles
    SET status = 'approved',
        display_name = 'EcoBazar Demo',
        verified_at = COALESCE(verified_at, now())
    WHERE id = seller_profile_id;
  END IF;

  SELECT id INTO category_sudaderas FROM categories WHERE slug = 'sudaderas-chamarras';
  SELECT id INTO category_tops FROM categories WHERE slug = 'camisetas-tops';
  SELECT id INTO category_pantalones FROM categories WHERE slug = 'pantalones';

  INSERT INTO products (
    seller_id,
    category_id,
    name,
    description,
    condition,
    price_cents,
    currency,
    status,
    published_at
  )
  SELECT
    seller_profile_id,
    category_sudaderas,
    'Sudadera vintage Nike gris',
    'Sudadera gris en muy buen estado, ideal para uso diario.',
    'buen estado',
    28000,
    'MXN',
    'active',
    now()
  WHERE category_sudaderas IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM products WHERE name = 'Sudadera vintage Nike gris'
    );

  INSERT INTO products (
    seller_id,
    category_id,
    name,
    description,
    condition,
    price_cents,
    currency,
    status,
    published_at
  )
  SELECT
    seller_profile_id,
    category_tops,
    'Playera grafica vintage',
    'Playera de algodon con estampado, sin manchas ni roturas.',
    'como nuevo',
    19000,
    'MXN',
    'active',
    now()
  WHERE category_tops IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM products WHERE name = 'Playera grafica vintage'
    );

  INSERT INTO products (
    seller_id,
    category_id,
    name,
    description,
    condition,
    price_cents,
    currency,
    status,
    published_at
  )
  SELECT
    seller_profile_id,
    category_pantalones,
    'Jeans mom fit azul oscuro',
    'Jeans mom fit color azul oscuro, comodos y listos para segunda vida.',
    'buen estado',
    24000,
    'MXN',
    'active',
    now()
  WHERE category_pantalones IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM products WHERE name = 'Jeans mom fit azul oscuro'
    );

  FOR seed_product_id IN
    SELECT id FROM products
    WHERE name IN (
      'Sudadera vintage Nike gris',
      'Playera grafica vintage',
      'Jeans mom fit azul oscuro'
    )
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM product_variants
      WHERE product_id = seed_product_id
    ) THEN
      INSERT INTO product_variants (product_id, size_name, stock)
      VALUES
        (seed_product_id, 'S', 2),
        (seed_product_id, 'M', 3);
    END IF;
  END LOOP;
END $$;

COMMIT;
