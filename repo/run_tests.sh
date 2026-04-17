#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${ROOT_DIR}"

source "${ROOT_DIR}/scripts/runtime_env.sh"
setup_runtime_env_ephemeral
export APP_PORT=0

cleanup() {
  docker compose down --volumes --remove-orphans
}

trap cleanup EXIT

echo "[run_tests] COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME}"

docker compose up --build -d db

# Project-standard database bootstrap path.
docker compose run --rm api bash -lc "./init_db.sh"

# Broad test wrapper (slice-1 scope): API + web unit/type checks.
docker compose run --rm api bash -lc "npm run typecheck -w @rrga/api && npm run test -w @rrga/api"
docker compose run --rm web bash -lc "npm run typecheck -w @rrga/web && npm run test -w @rrga/web"

echo "[run_tests] All scaffold tests passed."
