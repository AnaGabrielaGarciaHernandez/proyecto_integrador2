#!/bin/sh
set -eu

psql \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set ON_ERROR_STOP=1 \
  --set IDENTITY_DB_PASSWORD="${IDENTITY_DB_PASSWORD:-identity_dev}" \
  --set CATALOG_DB_PASSWORD="${CATALOG_DB_PASSWORD:-catalog_dev}" \
  --set CART_DB_PASSWORD="${CART_DB_PASSWORD:-cart_dev}" \
  --set ORDER_DB_PASSWORD="${ORDER_DB_PASSWORD:-ordering_dev}" \
  --set PAYMENT_DB_PASSWORD="${PAYMENT_DB_PASSWORD:-payment_dev}" \
  --set MODERATION_DB_PASSWORD="${MODERATION_DB_PASSWORD:-moderation_dev}" \
  --file /docker-entrypoint-initdb.d/000_create_roles.template
