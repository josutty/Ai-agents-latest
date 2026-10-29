#!/usr/bin/env bash
# Start API + UI for local E2E. Fill module roots in config.yaml before use.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_ROOT="${API_MODULE_ROOT:-${ROOT}/<api-module-root>}"
UI_ROOT="${UI_MODULE_ROOT:-${ROOT}/<ui-module-root>}"
API_PORT="${API_PORT:-8080}"
UI_PORT="${UI_PORT:-3000}"
PID_DIR="${ROOT}/.local-stack"
mkdir -p "$PID_DIR"

if [[ "$API_ROOT" == *"<"* ]] || [[ "$UI_ROOT" == *"<"* ]]; then
  echo "ERROR: Set modules.api.root and modules.ui.root in .github/config.yaml (or API_MODULE_ROOT / UI_MODULE_ROOT)." >&2
  exit 1
fi

stop_one() {
  local name="$1"
  local pidfile="${PID_DIR}/${name}.pid"
  if [[ -f "$pidfile" ]]; then
    local pid
    pid="$(cat "$pidfile")"
    kill "$pid" 2>/dev/null || true
    rm -f "$pidfile"
  fi
}

stop_one api
stop_one ui

echo "Starting API in ${API_ROOT} on :${API_PORT}..."
(
  cd "$API_ROOT"
  nohup mvn spring-boot:run -Dspring-boot.run.arguments="--server.port=${API_PORT}" \
    > "${PID_DIR}/api.log" 2>&1 &
  echo $! > "${PID_DIR}/api.pid"
)

echo "Starting UI in ${UI_ROOT} on :${UI_PORT}..."
(
  cd "$UI_ROOT"
  export NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-http://localhost:${API_PORT}}"
  export PORT="${UI_PORT}"
  nohup npm run dev > "${PID_DIR}/ui.log" 2>&1 &
  echo $! > "${PID_DIR}/ui.pid"
)

echo "Stack starting. Logs: ${PID_DIR}/api.log ${PID_DIR}/ui.log"
echo "Verify: bash scripts/verify-stack-health.sh"
