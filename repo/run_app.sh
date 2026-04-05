#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${ROOT_DIR}"

source "${ROOT_DIR}/scripts/runtime_env.sh"
setup_runtime_env_persistent "${ROOT_DIR}"

port_in_use() {
  local port="$1"
  [[ -n "$(ss -H -ltn "( sport = :${port} )" 2>/dev/null)" ]]
}

print_url() {
  local web_binding
  web_binding="$(docker compose port web 4173 | tr -d '\r')"
  if [[ -z "${web_binding}" ]]; then
    echo "[run_app] Unable to resolve web port (service may not be running)." >&2
    return 1
  fi

  local web_host="${web_binding%:*}"
  local web_port="${web_binding##*:}"
  echo "[run_app] Web UI available at http://${web_host}:${web_port}"
}

resolve_app_port() {
  local requested_port="${APP_PORT:-}"
  if [[ -n "${requested_port}" ]]; then
    if [[ ! "${requested_port}" =~ ^[0-9]+$ ]] || (( requested_port < 1 || requested_port > 65535 )); then
      echo "[run_app] APP_PORT must be an integer between 1 and 65535" >&2
      exit 1
    fi

    if port_in_use "${requested_port}"; then
      echo "[run_app] APP_PORT=${requested_port} is unavailable; falling back to random localhost port."
      export APP_PORT=0
      return
    fi

    export APP_PORT="${requested_port}"
    return
  fi

  export APP_PORT=0
}

COMMAND="${1:-up}"
if [[ $# -gt 0 ]]; then
  shift
fi

echo "[run_app] COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME}"

case "${COMMAND}" in
  up)
    resolve_app_port
    if [[ "${APP_PORT}" == "0" ]]; then
      echo "[run_app] Using random localhost port for web service."
    else
      echo "[run_app] Using fixed APP_PORT=${APP_PORT}"
    fi
    docker compose up --build -d "$@"
    print_url
    ;;
  down)
    docker compose down --remove-orphans "$@"
    ;;
  ps)
    docker compose ps "$@"
    ;;
  logs)
    docker compose logs "$@"
    ;;
  logs-follow)
    docker compose logs -f "$@"
    ;;
  url)
    print_url
    ;;
  *)
    echo "Usage: ./run_app.sh [up|down|ps|logs|logs-follow|url] [compose args...]" >&2
    exit 1
    ;;
esac
