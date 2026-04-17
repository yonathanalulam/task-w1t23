#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${ROOT_DIR}/scripts/runtime_env.sh"
setup_runtime_env_persistent "${ROOT_DIR}"

cd "${ROOT_DIR}"

docker compose up -d --build db api web

WEB_BINDING="$(docker compose port web 4173 | tr -d '\r')"
if [[ -z "${WEB_BINDING}" ]]; then
  echo "[run_integrated_e2e] Unable to resolve mapped web port." >&2
  exit 1
fi

WEB_URL="http://${WEB_BINDING}"
for _ in {1..90}; do
  if curl -fsS "${WEB_URL}/login" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -fsS "${WEB_URL}/login" >/dev/null 2>&1; then
  echo "[run_integrated_e2e] Web service did not become ready at ${WEB_URL}." >&2
  exit 1
fi

mkdir -p "${ROOT_DIR}/apps/web/test-results" "${ROOT_DIR}/apps/web/playwright-report"

E2E_IMAGE_TAG="${E2E_IMAGE_TAG:-rrga-playwright-e2e:local}"
docker build -f "${ROOT_DIR}/Dockerfile.playwright" -t "${E2E_IMAGE_TAG}" "${ROOT_DIR}"

docker run --rm \
  --network "${COMPOSE_PROJECT_NAME}_default" \
  --ipc host \
  -e PW_BASE_URL="http://web:4173" \
  -e PGHOST="db" \
  -e PGPORT="${RRGA_DB_PORT}" \
  -e PGUSER="${RRGA_DB_USER}" \
  -e PGPASSWORD="${RRGA_DB_PASSWORD}" \
  -e PGDATABASE="${RRGA_DB_NAME}" \
  -v "${ROOT_DIR}/apps/web/test-results:/workspace/apps/web/test-results" \
  -v "${ROOT_DIR}/apps/web/playwright-report:/workspace/apps/web/playwright-report" \
  "${E2E_IMAGE_TAG}" \
  bash -lc "npm run test:e2e -w @rrga/web -- --grep \"Integrated fullstack flows\""
