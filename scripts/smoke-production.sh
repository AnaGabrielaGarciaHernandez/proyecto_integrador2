#!/usr/bin/env bash
set -Eeuo pipefail

: "${APP_URL:?APP_URL is required, e.g. https://app.example.com}"
curl --fail --silent --show-error "$APP_URL/health/live" >/dev/null
curl --fail --silent --show-error "$APP_URL/api/health" >/dev/null
curl --fail --silent --show-error "$APP_URL/" | grep -q 'EcoBazar'
echo 'production smoke checks passed'
