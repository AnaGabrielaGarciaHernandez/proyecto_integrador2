\set ON_ERROR_STOP on

BEGIN;

SET LOCAL search_path TO catalog, public;

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
  FROM identity.users
  WHERE lower(email) = 'dev-vendedor@ecobazar.com';

  IF seller_user_id IS NULL THEN
    INSERT INTO identity.users (
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
      '$2b$12$S5F00B8cEsK2NB8d1XEr3OmRauDPYXdbz7PmtaLlEp63MDeatr8Fm',
      'email',
      'vendedor',
      now()
    )
    RETURNING id INTO seller_user_id;
  ELSE
    UPDATE identity.users
    SET full_name = 'Vendedor Demo EcoBazar',
        password_hash = '$2b$12$S5F00B8cEsK2NB8d1XEr3OmRauDPYXdbz7PmtaLlEp63MDeatr8Fm',
        auth_provider = 'email',
        google_sub = NULL,
        role = 'vendedor',
        is_active = true,
        email_verified_at = COALESCE(email_verified_at, now())
    WHERE id = seller_user_id;
  END IF;

  INSERT INTO catalog.user_role_projection (user_id, role, is_active, full_name)
  VALUES (seller_user_id, 'vendedor', true, 'Vendedor Demo EcoBazar')
  ON CONFLICT (user_id) DO UPDATE
  SET role = EXCLUDED.role,
      is_active = EXCLUDED.is_active,
      full_name = EXCLUDED.full_name,
      updated_at = now();

  SELECT id INTO seller_profile_id
  FROM catalog.seller_profiles
  WHERE user_id = seller_user_id;

  IF seller_profile_id IS NULL THEN
    INSERT INTO catalog.seller_profiles (
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
    UPDATE catalog.seller_profiles
    SET display_name = 'EcoBazar Demo',
        description = 'Vendedor de prueba para desarrollo local.',
        status = 'approved',
        verified_at = COALESCE(verified_at, now())
    WHERE id = seller_profile_id;
  END IF;

  SELECT id INTO category_sudaderas
  FROM catalog.categories WHERE slug = 'sudaderas-chamarras';
  SELECT id INTO category_tops
  FROM catalog.categories WHERE slug = 'camisetas-tops';
  SELECT id INTO category_pantalones
  FROM catalog.categories WHERE slug = 'pantalones';

  SELECT id INTO seed_product_id
  FROM catalog.products
  WHERE seller_id = seller_profile_id
    AND name = 'Sudadera vintage Nike gris'
  ORDER BY created_at
  LIMIT 1;

  IF seed_product_id IS NULL THEN
    INSERT INTO catalog.products (
      seller_id, category_id, name, description, condition,
      price_cents, currency, status, published_at
    )
    VALUES (
      seller_profile_id, category_sudaderas,
      'Sudadera vintage Nike gris',
      'Sudadera gris en muy buen estado, ideal para uso diario.',
      'buen estado', 28000, 'MXN', 'active', now()
    )
    RETURNING id INTO seed_product_id;
  END IF;

  INSERT INTO catalog.product_variants (product_id, size_name, stock)
  VALUES (seed_product_id, 'S', 2), (seed_product_id, 'M', 3)
  ON CONFLICT (product_id, size_name) DO NOTHING;

  SELECT id INTO seed_product_id
  FROM catalog.products
  WHERE seller_id = seller_profile_id
    AND name = 'Playera grafica vintage'
  ORDER BY created_at
  LIMIT 1;

  IF seed_product_id IS NULL THEN
    INSERT INTO catalog.products (
      seller_id, category_id, name, description, condition,
      price_cents, currency, status, published_at
    )
    VALUES (
      seller_profile_id, category_tops,
      'Playera grafica vintage',
      'Playera de algodon con estampado, sin manchas ni roturas.',
      'como nuevo', 19000, 'MXN', 'active', now()
    )
    RETURNING id INTO seed_product_id;
  END IF;

  INSERT INTO catalog.product_variants (product_id, size_name, stock)
  VALUES (seed_product_id, 'S', 2), (seed_product_id, 'M', 3)
  ON CONFLICT (product_id, size_name) DO NOTHING;

  SELECT id INTO seed_product_id
  FROM catalog.products
  WHERE seller_id = seller_profile_id
    AND name = 'Jeans mom fit azul oscuro'
  ORDER BY created_at
  LIMIT 1;

  IF seed_product_id IS NULL THEN
    INSERT INTO catalog.products (
      seller_id, category_id, name, description, condition,
      price_cents, currency, status, published_at
    )
    VALUES (
      seller_profile_id, category_pantalones,
      'Jeans mom fit azul oscuro',
      'Jeans mom fit color azul oscuro, comodos y listos para segunda vida.',
      'buen estado', 24000, 'MXN', 'active', now()
    )
    RETURNING id INTO seed_product_id;
  END IF;

  INSERT INTO catalog.product_variants (product_id, size_name, stock)
  VALUES (seed_product_id, 'S', 2), (seed_product_id, 'M', 3)
  ON CONFLICT (product_id, size_name) DO NOTHING;
END
$$;

COMMIT;
