#!/bin/sh
set -eu

if [ -f ./.env.production ]; then
  set -a
  . ./.env.production
  set +a
fi

: "${WEB_ORIGIN:?Set WEB_ORIGIN in .env.production or the environment}"

echo "[deploy/yc-smoke-check] Checking ${WEB_ORIGIN}/healthz"
curl -fsS "${WEB_ORIGIN}/healthz" >/dev/null

echo "[deploy/yc-smoke-check] Checking ${WEB_ORIGIN}/api/health"
curl -fsS "${WEB_ORIGIN}/api/health" >/dev/null

echo "[deploy/yc-smoke-check] Checking ${WEB_ORIGIN}/api/ready"
curl -fsS "${WEB_ORIGIN}/api/ready" >/dev/null

echo "[deploy/yc-smoke-check] Smoke checks passed"
