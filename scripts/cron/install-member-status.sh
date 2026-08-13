#!/usr/bin/env bash
# Install / refresh a daily cron job that runs member Active/Inactive sync once.
#
# Default schedule: 02:00 local time every day
# Override with: CRON_SCHEDULE="0 3 * * *" ./scripts/cron/install-member-status.sh
#
# Uninstall with: ./scripts/cron/install-member-status.sh --remove

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NODE_BIN="$(command -v node)"
SCHEDULE="${CRON_SCHEDULE:-0 2 * * *}"
MARKER_BEGIN="# BEGIN management-system-backend member-status-sync"
MARKER_END="# END management-system-backend member-status-sync"
LOG_DIR="$ROOT/logs"
LOG_FILE="$LOG_DIR/member-status-sync.log"
JOB_SCRIPT="$ROOT/scripts/jobs/sync-member-status.js"

if [[ -z "${NODE_BIN}" ]]; then
  echo "node not found on PATH" >&2
  exit 1
fi

mkdir -p "$LOG_DIR"

JOB_LINE="${SCHEDULE} cd \"${ROOT}\" && \"${NODE_BIN}\" \"${JOB_SCRIPT}\" >> \"${LOG_FILE}\" 2>&1"
BLOCK=$(printf '%s\n%s\n%s\n' "${MARKER_BEGIN}" "${JOB_LINE}" "${MARKER_END}")

CURRENT="$(crontab -l 2>/dev/null || true)"

# Drop any previous managed block.
FILTERED="$(
  printf '%s\n' "${CURRENT}" | awk -v begin="${MARKER_BEGIN}" -v end="${MARKER_END}" '
    $0 == begin { skip=1; next }
    $0 == end { skip=0; next }
    !skip { print }
  '
)"

if [[ "${1:-}" == "--remove" ]]; then
  printf '%s\n' "${FILTERED}" | crontab -
  echo "Removed member-status-sync cron job"
  exit 0
fi

{
  printf '%s\n' "${FILTERED}"
  # Ensure a blank line before our block when crontab already has content.
  if [[ -n "$(printf '%s' "${FILTERED}" | tr -d '[:space:]')" ]]; then
    printf '\n'
  fi
  printf '%s\n' "${BLOCK}"
} | crontab -

echo "Installed member-status-sync cron job"
echo "  schedule: ${SCHEDULE}"
echo "  command:  ${NODE_BIN} ${JOB_SCRIPT}"
echo "  log:      ${LOG_FILE}"
echo
crontab -l | awk -v begin="${MARKER_BEGIN}" -v end="${MARKER_END}" '
  $0 == begin { show=1 }
  show { print }
  $0 == end { show=0 }
'
