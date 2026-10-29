#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_URL="${API_HEALTH_URL:-http://localhost:8080/actuator/health}"
UI_URL="${UI_HEALTH_URL:-http://localhost:3000}"
MAX_WAIT="${STACK_WAIT_SEC:-120}"
INTERVAL=3
elapsed=0

wait_url() {
  local label="$1"
  local url="$2"
  elapsed=0
  while (( elapsed < MAX_WAIT )); do
    if curl -sf "$url" >/dev/null 2>&1; then
      echo "OK ${label}: ${url}"
      return 0
    fi
    sleep "$INTERVAL"
    elapsed=$((elapsed + INTERVAL))
  done
  echo "FAIL ${label}: ${url} not ready after ${MAX_WAIT}s" >&2
  return 1
}

wait_url "API" "$API_URL"
wait_url "UI" "$UI_URL"
echo "Stack healthy."
