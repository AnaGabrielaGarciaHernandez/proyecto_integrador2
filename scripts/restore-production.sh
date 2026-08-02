#!/usr/bin/env bash
set -Eeuo pipefail

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_ARGS=(--env-file "$ENV_FILE" -f compose.yaml -f compose.production.yaml)

if [[ "${RESTORE_CONFIRM:-}" != 'YES' ]]; then
  echo 'This overwrites production data. Re-run with RESTORE_CONFIRM=YES.' >&2
  exit 1
fi

set -a
source "$ENV_FILE"
set +a
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required}"
: "${RESTIC_PASSWORD_FILE:?RESTIC_PASSWORD_FILE is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"

command -v docker >/dev/null || { echo 'docker is required' >&2; exit 1; }
command -v restic >/dev/null || { echo 'restic is required' >&2; exit 1; }

restore_dir="$(mktemp -d "${TMPDIR:-/tmp}/ecobazar-restore.XXXXXX")"
trap 'rm -rf "$restore_dir"' EXIT

restic restore latest --target "$restore_dir"
dump="$(find "$restore_dir" -type f -name postgres.dump -print -quit)"
[[ -n "$dump" ]] || { echo 'postgres.dump was not found in the snapshot' >&2; exit 1; }

echo '[restore] stopping application services'
docker compose "${COMPOSE_ARGS[@]}" stop \
  caddy frontend-web api-gateway identity-service catalog-service cart-service \
  order-service payment-service moderation-service || true

echo '[restore] restoring PostgreSQL'
docker compose "${COMPOSE_ARGS[@]}" exec -T postgres \
  pg_restore --clean --if-exists --no-owner --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  < "$dump"

echo '[restore] starting application services'
docker compose "${COMPOSE_ARGS[@]}" up -d
echo '[restore] database restore completed; Supabase files, if present, require provider-specific re-upload'
