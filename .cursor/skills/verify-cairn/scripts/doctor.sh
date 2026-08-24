#!/usr/bin/env bash
# Read-only health check for the verification instance.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTANCE_FILE="$SKILL_DIR/scratch/instance.json"

if [[ ! -f "$INSTANCE_FILE" ]]; then
  echo "FAIL: no instance.json — run scripts/launch.sh first." >&2
  exit 1
fi

PORT="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$INSTANCE_FILE','utf8')).port)")"
SESSION="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$INSTANCE_FILE','utf8')).session)")"
CAIRN_HOME="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$INSTANCE_FILE','utf8')).cairnHome)")"

if ! tmux -f /exec-daemon/tmux.portal.conf has-session -t "$SESSION" 2>/dev/null; then
  echo "FAIL: tmux session $SESSION is not running." >&2
  exit 1
fi

if ! curl -sf "http://127.0.0.1:${PORT}/api/cairn" >/dev/null; then
  echo "FAIL: GET /api/cairn on port $PORT did not succeed." >&2
  exit 1
fi

BODY="$(curl -sf "http://127.0.0.1:${PORT}/api/cairn")"
node -e "const b=JSON.parse(process.argv[1]); if(b.kind!=='recalled') process.exit(1)" "$BODY" || {
  echo "FAIL: GET /api/cairn did not return kind=recalled." >&2
  exit 1
}

if [[ ! -d "$CAIRN_HOME" ]]; then
  echo "FAIL: CAIRN_HOME missing at $CAIRN_HOME" >&2
  exit 1
fi

echo "OK: session=$SESSION port=$PORT cairnHome=$CAIRN_HOME"
