#!/bin/sh
set -eu

if [ -f ./.env.production ]; then
  set -a
  . ./.env.production
  set +a
fi

: "${YC_REGISTRY_HOST:=cr.yandex}"
: "${YC_REGISTRY_ID:?Set YC_REGISTRY_ID in .env.production or the environment}"
: "${IMAGE_TAG:=latest}"

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
  echo "[deploy/yc-build-push] Error: yc CLI was not found in PATH or the default Windows install location" >&2
  exit 1
fi

API_IMAGE="${YC_REGISTRY_HOST}/${YC_REGISTRY_ID}/scrumbun-api:${IMAGE_TAG}"
WEB_IMAGE="${YC_REGISTRY_HOST}/${YC_REGISTRY_ID}/scrumbun-web:${IMAGE_TAG}"

echo "[deploy/yc-build-push] Logging into Yandex Cloud Registry ${YC_REGISTRY_HOST}"
"${YC_CLI}" iam create-token | docker login --username iam --password-stdin "${YC_REGISTRY_HOST}"

echo "[deploy/yc-build-push] Building API image ${API_IMAGE}"
docker build -f docker/api.Dockerfile -t "${API_IMAGE}" .

echo "[deploy/yc-build-push] Building web image ${WEB_IMAGE}"
docker build -f docker/web.Dockerfile -t "${WEB_IMAGE}" .

echo "[deploy/yc-build-push] Pushing API image"
docker push "${API_IMAGE}"

echo "[deploy/yc-build-push] Pushing web image"
docker push "${WEB_IMAGE}"

echo "[deploy/yc-build-push] Build and push complete"
