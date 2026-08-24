#!/usr/bin/env bash
# Start an isolated Cairn dev instance for verification.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"
PORT="${VERIFY_CAIRN_PORT:-14721}"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
RUN_DIR="$SKILL_DIR/scratch/$RUN_ID"
SESSION="cairn-verify-$RUN_ID"

mkdir -p "$RUN_DIR/project"
cd "$RUN_DIR/project"
unset CAIRN_HOME CAIRN_DB_PATH
node "$REPO_ROOT/bin/cairn.mjs" init --project --demo >/dev/null
CAIRN_HOME="$RUN_DIR/project/.cairn"
CAIRN_DB_PATH="$CAIRN_HOME/cairn.db"
export CAIRN_HOME CAIRN_DB_PATH

cd "$REPO_ROOT"
if ! npm run build >/dev/null 2>&1; then
  echo "Production build failed; fix before verifying." >&2
  exit 1
fi

tmux -f /exec-daemon/tmux.portal.conf new-session -d -s "$SESSION" -c "$REPO_ROOT" -- \
  env CAIRN_HOME="$CAIRN_HOME" CAIRN_DB_PATH="$CAIRN_DB_PATH" npm run start -- --port "$PORT"

ready=0
for _ in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:${PORT}/api/cairn" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.5
done

if [[ "$ready" -ne 1 ]]; then
  tmux -f /exec-daemon/tmux.portal.conf kill-session -t "$SESSION" 2>/dev/null || true
  echo "Cairn did not become ready on port $PORT within 30s." >&2
  exit 1
fi

INSTANCE_FILE="$SKILL_DIR/scratch/instance.json"
cat >"$INSTANCE_FILE" <<EOF
{
  "runId": "$RUN_ID",
  "session": "$SESSION",
  "port": $PORT,
  "cairnHome": "$CAIRN_HOME",
  "dbPath": "$CAIRN_DB_PATH",
  "repoRoot": "$REPO_ROOT",
  "startedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo "$INSTANCE_FILE"
echo "Cairn verify instance ready at http://127.0.0.1:${PORT}/ (CAIRN_HOME=$CAIRN_HOME)"
