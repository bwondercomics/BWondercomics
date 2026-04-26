#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="${BWC_BASE_DIR:-/srv/bw-quality}"
COMPOSE_FILE="${COMPOSE_FILE:-deploy/bwondercomics-compose.yml}"
ENV_FILE="${ENV_FILE:-deploy/bwondercomics.env}"
TAIL_LINES="${LOG_TAIL_LINES:-200}"

cd "$BASE_DIR"

if [[ $# -gt 0 ]]; then
  exec docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" logs --tail="$TAIL_LINES" "$@"
fi

exec docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" logs --tail="$TAIL_LINES"
