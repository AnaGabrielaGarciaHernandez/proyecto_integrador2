\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

SELECT 'CREATE ROLE ecobazar_identity LOGIN PASSWORD ''identity_dev'' NOINHERIT'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ecobazar_identity')\gexec
SELECT 'CREATE ROLE ecobazar_catalog LOGIN PASSWORD ''catalog_dev'' NOINHERIT'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ecobazar_catalog')\gexec
SELECT 'CREATE ROLE ecobazar_cart LOGIN PASSWORD ''cart_dev'' NOINHERIT'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ecobazar_cart')\gexec
SELECT 'CREATE ROLE ecobazar_ordering LOGIN PASSWORD ''ordering_dev'' NOINHERIT'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ecobazar_ordering')\gexec
SELECT 'CREATE ROLE ecobazar_payment LOGIN PASSWORD ''payment_dev'' NOINHERIT'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ecobazar_payment')\gexec
SELECT 'CREATE ROLE ecobazar_moderation LOGIN PASSWORD ''moderation_dev'' NOINHERIT'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ecobazar_moderation')\gexec

CREATE SCHEMA IF NOT EXISTS identity AUTHORIZATION ecobazar_identity;
CREATE SCHEMA IF NOT EXISTS catalog AUTHORIZATION ecobazar_catalog;
CREATE SCHEMA IF NOT EXISTS cart AUTHORIZATION ecobazar_cart;
CREATE SCHEMA IF NOT EXISTS ordering AUTHORIZATION ecobazar_ordering;
CREATE SCHEMA IF NOT EXISTS payment AUTHORIZATION ecobazar_payment;
CREATE SCHEMA IF NOT EXISTS moderation AUTHORIZATION ecobazar_moderation;

DO $$
BEGIN
  EXECUTE format(
    'GRANT CONNECT ON DATABASE %I TO ecobazar_identity, ecobazar_catalog, ecobazar_cart, ecobazar_ordering, ecobazar_payment, ecobazar_moderation',
    current_database()
  );
END $$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
ALTER ROLE ecobazar_identity SET search_path = identity, public;
ALTER ROLE ecobazar_catalog SET search_path = catalog, public;
ALTER ROLE ecobazar_cart SET search_path = cart, public;
ALTER ROLE ecobazar_ordering SET search_path = ordering, public;
ALTER ROLE ecobazar_payment SET search_path = payment, public;
ALTER ROLE ecobazar_moderation SET search_path = moderation, public;
