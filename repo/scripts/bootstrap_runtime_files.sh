#!/bin/sh
set -eu

STATE_DIR="${RUNTIME_STATE_DIR:-/run/rrga-runtime}"
mkdir -p "${STATE_DIR}"
chmod 700 "${STATE_DIR}"

random_alnum() {
  length="$1"
  tr -dc 'a-z0-9' </dev/urandom | head -c "${length}"
}

ensure_value() {
  file_name="$1"
  prefix="$2"
  length="$3"
  target="${STATE_DIR}/${file_name}"

  if [ -s "${target}" ]; then
    return 0
  fi

  umask 077
  printf '%s%s' "${prefix}" "$(random_alnum "${length}")" >"${target}"
}

ensure_value "db_user" "u_" 10
ensure_value "db_password" "p_" 30
ensure_value "db_name" "d_" 12
ensure_value "app_session_secret" "sess_" 32
ensure_value "app_encryption_key" "enc_" 32

echo "[runtime-init] Runtime files prepared in ${STATE_DIR}"
