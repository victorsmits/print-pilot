#!/bin/sh
set -eu

APP_ROOT="${APP_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)}"
PRINTPILOT_DATA_DIR="${PRINTPILOT_DATA_DIR:-/data}"
SELF_HOSTED_USER_EMAIL="${SELF_HOSTED_USER_EMAIL:-owner@printpilot.local}"
SELF_HOSTED_USER_NAME="${SELF_HOSTED_USER_NAME:-Propriétaire PrintPilot}"
AUTH_DISABLED="${AUTH_DISABLED:-false}"
GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}"
GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-}"
SESSION_SECRET="${SESSION_SECRET:-}"
PUBLIC_APP_URL="${PUBLIC_APP_URL:-}"
PORT="${PORT:-3000}"
export CI="${CI:-true}"

mkdir -p "$PRINTPILOT_DATA_DIR"

"${APP_ROOT}/node_modules/.bin/wrangler" d1 migrations apply DB \
  --config "${APP_ROOT}/wrangler.selfhost.jsonc" \
  --local \
  --persist-to "$PRINTPILOT_DATA_DIR"

exec "${APP_ROOT}/node_modules/.bin/wrangler" dev \
  --config "${APP_ROOT}/wrangler.selfhost.jsonc" \
  --local \
  --persist-to "$PRINTPILOT_DATA_DIR" \
  --ip 0.0.0.0 \
  --port "$PORT" \
  --log-level info \
  --var "SELF_HOSTED:true" \
  --var "AUTH_DISABLED:${AUTH_DISABLED}" \
  --var "GOOGLE_CLIENT_ID:${GOOGLE_CLIENT_ID}" \
  --var "GOOGLE_CLIENT_SECRET:${GOOGLE_CLIENT_SECRET}" \
  --var "SESSION_SECRET:${SESSION_SECRET}" \
  --var "PUBLIC_APP_URL:${PUBLIC_APP_URL}" \
  --var "SELF_HOSTED_USER_EMAIL:${SELF_HOSTED_USER_EMAIL}" \
  --var "SELF_HOSTED_USER_NAME:${SELF_HOSTED_USER_NAME}"
