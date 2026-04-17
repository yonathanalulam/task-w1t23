#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="${ROOT_DIR}/apps/api/migrations"

load_required_from_env_or_file() {
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
      echo "[init_db] ${file_var} points to unreadable path: ${file_path}" >&2
      exit 1
    fi
    local from_file
    from_file="$(<"${file_path}")"
    printf '%s' "${from_file}"
    return 0
  fi

  echo "[init_db] Missing required variable: ${name} (or ${file_var})" >&2
  exit 1
}

PGHOST="$(load_required_from_env_or_file PGHOST)"
PGPORT="$(load_required_from_env_or_file PGPORT)"
PGUSER="$(load_required_from_env_or_file PGUSER)"
PGPASSWORD="$(load_required_from_env_or_file PGPASSWORD)"
PGDATABASE="$(load_required_from_env_or_file PGDATABASE)"

export PGPASSWORD

echo "[init_db] Waiting for PostgreSQL at ${PGHOST}:${PGPORT}..."
until pg_isready -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d postgres >/dev/null 2>&1; do
  sleep 1
done

db_exists="$(psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${PGDATABASE}'")"
if [[ "${db_exists//[[:space:]]/}" != "1" ]]; then
  echo "[init_db] Creating database ${PGDATABASE}..."
  createdb -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" "${PGDATABASE}"
fi

echo "[init_db] Ensuring migration table exists..."
psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}" -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

for migration in "${MIGRATIONS_DIR}"/*.sql; do
  version="$(basename "${migration}")"
  applied="$(psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}" -tAc "SELECT 1 FROM schema_migrations WHERE version='${version}'")"

  if [[ "${applied}" == "1" ]]; then
    echo "[init_db] Skipping already-applied migration ${version}"
    continue
  fi

  echo "[init_db] Applying migration ${version}"
  psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}" -v ON_ERROR_STOP=1 -f "${migration}"
  psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}" -v ON_ERROR_STOP=1 -c "INSERT INTO schema_migrations(version) VALUES ('${version}')"
done

echo "[init_db] Database initialization complete."
