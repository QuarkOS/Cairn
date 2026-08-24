#!/usr/bin/env bash
# Tear down the verification instance. Does not delete evidence/.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTANCE_FILE="$SKILL_DIR/scratch/instance.json"

if [[ ! -f "$INSTANCE_FILE" ]]; then
  echo "No instance.json — nothing to clean up."
  exit 0
fi

SESSION="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$INSTANCE_FILE','utf8')).session)")"
RUN_ID="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$INSTANCE_FILE','utf8')).runId)")"
RUN_DIR="$SKILL_DIR/scratch/$RUN_ID"

if tmux -f /exec-daemon/tmux.portal.conf has-session -t "$SESSION" 2>/dev/null; then
  tmux -f /exec-daemon/tmux.portal.conf kill-session -t "$SESSION"
fi

rm -rf "$RUN_DIR"
rm -f "$INSTANCE_FILE"

echo "Cleaned up verify instance $RUN_ID (evidence preserved under $SKILL_DIR/evidence/)."
