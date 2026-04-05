#!/usr/bin/env bash
set -euo pipefail

RUNTIME_STATE_DIR=""

init_runtime_state_dir() {
  local root_dir="$1"
  RUNTIME_STATE_DIR="${root_dir}/.runtime"
  mkdir -p "${RUNTIME_STATE_DIR}"
  chmod 700 "${RUNTIME_STATE_DIR}"
}

random_alnum() {
  local length="${1:-24}"
  if command -v openssl >/dev/null 2>&1; then
    local token
    token="$(openssl rand -hex "${length}")"
    printf '%s' "${token:0:length}"
    return 0
  fi

  local token=""
  while [[ ${#token} -lt ${length} ]]; do
    token+="$(printf '%x' "$RANDOM")"
  done
  printf '%s' "${token:0:length}"
}

load_from_env_or_file() {
  local name="$1"
  local value="${!name:-}"
  local file_var="${name}_FILE"
  local file_path="${!file_var:-}"

  if [[ -n "${value}" ]]; then
    printf '%s' "${value}"
    return 0
  fi

  if [[ -n "${file_path}" ]]; then
    if [[ ! -r "${file_path}" ]]; then
      echo "[runtime_env] ${file_var} points to unreadable path: ${file_path}" >&2
      return 1
    fi
    local from_file
    from_file="$(<"${file_path}")"
    printf '%s' "${from_file}"
    return 0
  fi

  printf ''
}

read_or_generate_state_value() {
  local file_name="$1"
  local prefix="$2"
  local length="$3"
  local value=""
  local file_path="${RUNTIME_STATE_DIR}/${file_name}"

  if [[ -f "${file_path}" ]]; then
    value="$(<"${file_path}")"
  else
    value="${prefix}$(random_alnum "${length}")"
    umask 077
    printf '%s' "${value}" > "${file_path}"
    chmod 600 "${file_path}"
  fi

  printf '%s' "${value}"
}

persist_value() {
  local file_name="$1"
  local value="$2"
  local file_path="${RUNTIME_STATE_DIR}/${file_name}"
  umask 077
  printf '%s' "${value}" > "${file_path}"
  chmod 600 "${file_path}"
}

load_or_persisted_value() {
  local env_name="$1"
  local file_name="$2"
  local prefix="$3"
  local random_len="$4"

  local value
  value="$(load_from_env_or_file "${env_name}")"

  if [[ -n "${value}" ]]; then
    persist_value "${file_name}" "${value}"
    printf '%s' "${value}"
    return 0
  fi

  read_or_generate_state_value "${file_name}" "${prefix}" "${random_len}"
}

setup_runtime_env_persistent() {
  local root_dir="$1"
  init_runtime_state_dir "${root_dir}"

  export RRGA_DB_USER="$(load_or_persisted_value RRGA_DB_USER db_user 'u_' 10)"
  export RRGA_DB_NAME="$(load_or_persisted_value RRGA_DB_NAME db_name 'd_' 12)"
  export RRGA_DB_PASSWORD="$(load_or_persisted_value RRGA_DB_PASSWORD db_password 'p_' 30)"

  local db_host
  db_host="$(load_from_env_or_file RRGA_DB_HOST)"
  if [[ -n "${db_host}" ]]; then
    persist_value db_host "${db_host}"
    export RRGA_DB_HOST="${db_host}"
  elif [[ -f "${RUNTIME_STATE_DIR}/db_host" ]]; then
    export RRGA_DB_HOST="$(<"${RUNTIME_STATE_DIR}/db_host")"
  else
    export RRGA_DB_HOST="db"
    persist_value db_host "${RRGA_DB_HOST}"
  fi

  local db_port
  db_port="$(load_from_env_or_file RRGA_DB_PORT)"
  if [[ -n "${db_port}" ]]; then
    persist_value db_port "${db_port}"
    export RRGA_DB_PORT="${db_port}"
  elif [[ -f "${RUNTIME_STATE_DIR}/db_port" ]]; then
    export RRGA_DB_PORT="$(<"${RUNTIME_STATE_DIR}/db_port")"
  else
    export RRGA_DB_PORT="5432"
    persist_value db_port "${RRGA_DB_PORT}"
  fi

  export APP_SESSION_SECRET="$(load_or_persisted_value APP_SESSION_SECRET app_session_secret 'sess_' 32)"
  export APP_ENCRYPTION_KEY="$(load_or_persisted_value APP_ENCRYPTION_KEY app_encryption_key 'enc_' 32)"

  local compose_project_name
  compose_project_name="$(load_from_env_or_file COMPOSE_PROJECT_NAME)"
  if [[ -n "${compose_project_name}" ]]; then
    persist_value compose_project_name "${compose_project_name}"
    export COMPOSE_PROJECT_NAME="${compose_project_name}"
  elif [[ -f "${RUNTIME_STATE_DIR}/compose_project_name" ]]; then
    export COMPOSE_PROJECT_NAME="$(<"${RUNTIME_STATE_DIR}/compose_project_name")"
  else
    compose_project_name="$(${root_dir}/scripts/compose_project_name.sh)"
    persist_value compose_project_name "${compose_project_name}"
    export COMPOSE_PROJECT_NAME="${compose_project_name}"
  fi
}

setup_runtime_env_ephemeral() {
  export RRGA_DB_USER="u_$(random_alnum 10)"
  export RRGA_DB_NAME="d_$(random_alnum 12)"
  export RRGA_DB_PASSWORD="p_$(random_alnum 30)"
  export RRGA_DB_HOST="${RRGA_DB_HOST:-db}"
  export RRGA_DB_PORT="${RRGA_DB_PORT:-5432}"
  export APP_SESSION_SECRET="${APP_SESSION_SECRET:-sess_$(random_alnum 32)}"
  export APP_ENCRYPTION_KEY="${APP_ENCRYPTION_KEY:-enc_$(random_alnum 32)}"

  if [[ -z "${COMPOSE_PROJECT_NAME:-}" ]]; then
    local repo_name
    repo_name="$(basename "$(pwd)")"
    COMPOSE_PROJECT_NAME="rrga-test-${repo_name}-$(random_alnum 8)"
  fi
  export COMPOSE_PROJECT_NAME
}
