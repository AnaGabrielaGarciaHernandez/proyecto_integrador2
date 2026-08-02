#!/usr/bin/env bash
set -Eeuo pipefail

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_ARGS=(--env-file "$ENV_FILE" -f compose.yaml -f compose.production.yaml)

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

set -a
# The production env file is operator-controlled. Keep it chmod 600 and quote
# values that contain spaces or shell metacharacters.
source "$ENV_FILE"
set +a

: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required}"
: "${RESTIC_PASSWORD_FILE:?RESTIC_PASSWORD_FILE is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"

command -v docker >/dev/null || { echo 'docker is required' >&2; exit 1; }
command -v restic >/dev/null || { echo 'restic is required' >&2; exit 1; }

backup_dir="$(mktemp -d "${TMPDIR:-/tmp}/ecobazar-backup.XXXXXX")"
trap 'rm -rf "$backup_dir"' EXIT

echo '[backup] dumping PostgreSQL'
docker compose "${COMPOSE_ARGS[@]}" exec -T postgres \
  pg_dump --format=custom --no-owner --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  > "$backup_dir/postgres.dump"

cat > "$backup_dir/manifest.txt" <<EOF
created_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
database=$POSTGRES_DB
compose_project=ecobazar
EOF

download_bucket() {
  local bucket="$1"
  local target_dir="$backup_dir/storage/$bucket"
  local offset=0
  local page
  local count
  mkdir -p "$target_dir"

  while true; do
    page="$(curl -fsS \
      -H "apikey: $SUPABASE_SERVER_KEY" \
      -H "Authorization: Bearer $SUPABASE_SERVER_KEY" \
      -H 'Content-Type: application/json' \
      -X POST "$SUPABASE_URL/storage/v1/object/list/$bucket" \
      --data "{\"prefix\":\"\",\"limit\":1000,\"offset\":$offset}")"
    count="$(jq 'length' <<<"$page")"
    [[ "$count" == '0' ]] && break

    while IFS= read -r name; do
      [[ -z "$name" ]] && continue
      case "$name" in
        /*|*..*) echo "Unsafe storage object path: $name" >&2; exit 1 ;;
      esac
      mkdir -p "$target_dir/$(dirname "$name")"
      curl -fsS \
        -H "apikey: $SUPABASE_SERVER_KEY" \
        -H "Authorization: Bearer $SUPABASE_SERVER_KEY" \
        "$SUPABASE_URL/storage/v1/object/$bucket/$name" \
        -o "$target_dir/$name"
    done < <(jq -r '.[].name // empty' <<<"$page")

    ((offset += count))
    (( count < 1000 )) && break
  done
}

if [[ -n "${SUPABASE_URL:-}" && -n "${SUPABASE_SERVER_KEY:-}" ]]; then
  command -v curl >/dev/null || { echo 'curl is required for Supabase backups' >&2; exit 1; }
  command -v jq >/dev/null || { echo 'jq is required for Supabase backups' >&2; exit 1; }
  echo '[backup] exporting Supabase storage objects'
  download_bucket "${SUPABASE_AVATAR_BUCKET:-avatars}"
  download_bucket "${SUPABASE_PRODUCT_IMAGES_BUCKET:-product-images}"
fi

echo '[backup] uploading encrypted snapshot'
restic backup "$backup_dir" --tag ecobazar-production
restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
restic check
echo '[backup] completed'
