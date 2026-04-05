#!/usr/bin/env bash
set -euo pipefail

repo_name="$(basename "$(pwd)")"
user_name="${USER:-local}"

sanitize() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-'
}

printf '%s' "$(sanitize "rrga-${user_name}-${repo_name}")"
