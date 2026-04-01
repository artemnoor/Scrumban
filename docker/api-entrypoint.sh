#!/bin/sh
set -eu

SCHEMA_PATH="packages/db/prisma/schema.prisma"

append_database_ssl_options() {
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "[docker/api-entrypoint] DATABASE_URL is not set"
    exit 1
  fi

  if [ "${DATABASE_SSL_MODE:-disable}" = "disable" ]; then
    echo "[docker/api-entrypoint] DATABASE_SSL_MODE=disable, using raw DATABASE_URL"
    return
  fi

  if echo "${DATABASE_URL}" | grep -q "sslmode="; then
    echo "[docker/api-entrypoint] DATABASE_URL already contains sslmode, leaving it unchanged"
    return
  fi

  EXTRA_QUERY="sslmode=${DATABASE_SSL_MODE}"

  if [ -n "${DATABASE_SSL_ROOT_CERT_PATH:-}" ]; then
    if [ ! -f "${DATABASE_SSL_ROOT_CERT_PATH}" ]; then
      echo "[docker/api-entrypoint] DATABASE_SSL_ROOT_CERT_PATH points to a missing file: ${DATABASE_SSL_ROOT_CERT_PATH}"
      exit 1
    fi

    EXTRA_QUERY="${EXTRA_QUERY}&sslrootcert=${DATABASE_SSL_ROOT_CERT_PATH}"
    echo "[docker/api-entrypoint] Using PostgreSQL CA certificate at ${DATABASE_SSL_ROOT_CERT_PATH}"
  fi

  case "${DATABASE_URL}" in
    *\?*)
      export DATABASE_URL="${DATABASE_URL}&${EXTRA_QUERY}"
      ;;
    *)
      export DATABASE_URL="${DATABASE_URL}?${EXTRA_QUERY}"
      ;;
  esac

  echo "[docker/api-entrypoint] DATABASE_URL updated with managed PostgreSQL SSL options"
}

run_database_apply_strategy() {
  case "${DATABASE_APPLY_STRATEGY:-push}" in
    push)
      echo "[docker/api-entrypoint] Applying Prisma schema with db push"
      pnpm --filter @scrumbun/db db:push
      ;;
    migrate-deploy)
      echo "[docker/api-entrypoint] Applying Prisma migrations with migrate deploy"
      pnpm --filter @scrumbun/db db:deploy
      ;;
    none)
      echo "[docker/api-entrypoint] DATABASE_APPLY_STRATEGY=none, skipping schema application"
      ;;
    *)
      echo "[docker/api-entrypoint] Unsupported DATABASE_APPLY_STRATEGY: ${DATABASE_APPLY_STRATEGY:-}"
      exit 1
      ;;
  esac
}

if [ "${PRISMA_GENERATE_ON_BOOT:-false}" = "true" ]; then
  echo "[docker/api-entrypoint] PRISMA_GENERATE_ON_BOOT=true, generating Prisma client"
  pnpm --filter @scrumbun/db db:generate
else
  echo "[docker/api-entrypoint] Skipping Prisma client generation at boot"
fi

append_database_ssl_options
run_database_apply_strategy

echo "[docker/api-entrypoint] Starting Fastify API"
exec pnpm exec tsx apps/api/src/main.ts
