#!/bin/sh
set -eu

if [ -f ./.env.production ]; then
  set -a
  . ./.env.production
  set +a
fi

: "${APP_DOMAIN:?Set APP_DOMAIN in .env.production or the environment}"
: "${TLS_CERT_PATH:?Set TLS_CERT_PATH in .env.production or the environment}"
: "${TLS_KEY_PATH:?Set TLS_KEY_PATH in .env.production or the environment}"
: "${WEB_PUBLIC_PORT:=8080}"

OUTPUT_PATH="${1:-./rendered/scrumbun-host-proxy.conf}"
OUTPUT_DIR="$(dirname "${OUTPUT_PATH}")"

mkdir -p "${OUTPUT_DIR}"
envsubst '${APP_DOMAIN} ${TLS_CERT_PATH} ${TLS_KEY_PATH} ${WEB_PUBLIC_PORT}' \
  < docker/nginx/host-proxy.conf.template \
  > "${OUTPUT_PATH}"

echo "[deploy/render-host-nginx] Wrote ${OUTPUT_PATH}"
