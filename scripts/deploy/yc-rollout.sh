#!/bin/sh
set -eu

if [ -f ./.env.production ]; then
  set -a
  . ./.env.production
  set +a
fi

: "${DEPLOY_HOST:?Set DEPLOY_HOST in .env.production or the environment}"
: "${DEPLOY_USER:?Set DEPLOY_USER in .env.production or the environment}"
: "${DEPLOY_PATH:=/opt/scrumbun}"
: "${YC_REGISTRY_HOST:=cr.yandex}"

WIN_USERNAME="${USERNAME:-}"
YC_CLI="${YC_CLI:-}"
if [ -z "${YC_CLI}" ] && command -v yc >/dev/null 2>&1; then
  YC_CLI="$(command -v yc)"
fi
if [ -z "${YC_CLI}" ]; then
  for candidate in \
    "${HOME}/yandex-cloud/bin/yc.exe" \
    "${HOME}/yandex-cloud/bin/yc"
  do
    if [ -x "${candidate}" ]; then
      YC_CLI="${candidate}"
      break
    fi
  done
fi
if [ -z "${YC_CLI}" ] && [ -n "${WIN_USERNAME}" ]; then
  for candidate in \
    "/c/Users/${WIN_USERNAME}/yandex-cloud/bin/yc.exe" \
    "/c/Users/${WIN_USERNAME}/yandex-cloud/bin/yc"
  do
    if [ -x "${candidate}" ]; then
      YC_CLI="${candidate}"
      break
    fi
  done
fi
if [ -z "${YC_CLI}" ]; then
  echo "[deploy/yc-rollout] Error: yc CLI was not found in PATH or the default Windows install location" >&2
  exit 1
fi

ssh_cmd() {
  if [ -n "${DEPLOY_SSH_KEY_PATH:-}" ]; then
    ssh -i "${DEPLOY_SSH_KEY_PATH}" -o IdentitiesOnly=yes "$@"
  else
    ssh "$@"
  fi
}

scp_cmd() {
  if [ -n "${DEPLOY_SSH_KEY_PATH:-}" ]; then
    scp -i "${DEPLOY_SSH_KEY_PATH}" -o IdentitiesOnly=yes "$@"
  else
    scp "$@"
  fi
}

echo "[deploy/yc-rollout] Preparing remote directory ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}"
ssh_cmd "${DEPLOY_USER}@${DEPLOY_HOST}" "mkdir -p '${DEPLOY_PATH}' '${DEPLOY_PATH}/docker/nginx' '${DEPLOY_PATH}/certs'"

echo "[deploy/yc-rollout] Uploading deployment artifacts"
scp_cmd compose.production.yml "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/compose.production.yml"
scp_cmd .env.production "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/.env.production"
scp_cmd docker/nginx/host-proxy.conf.template "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/docker/nginx/host-proxy.conf.template"

TOKEN="$("${YC_CLI}" iam create-token)"

echo "[deploy/yc-rollout] Logging remote Docker into Yandex Cloud Registry"
printf "%s" "${TOKEN}" | ssh_cmd "${DEPLOY_USER}@${DEPLOY_HOST}" "sudo docker login --username iam --password-stdin '${YC_REGISTRY_HOST}'"

echo "[deploy/yc-rollout] Pulling and starting containers"
ssh_cmd "${DEPLOY_USER}@${DEPLOY_HOST}" "
  cd '${DEPLOY_PATH}' && \
  sudo docker compose --env-file .env.production -f compose.production.yml pull && \
  sudo docker compose --env-file .env.production -f compose.production.yml up -d --remove-orphans && \
  sudo docker compose --env-file .env.production -f compose.production.yml ps
"

echo "[deploy/yc-rollout] Rollout complete"
