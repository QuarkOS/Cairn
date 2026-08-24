#!/usr/bin/env bash
# Verify CLI recall against the verify instance CAIRN_HOME.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"
INSTANCE_FILE="$SKILL_DIR/scratch/instance.json"
EVIDENCE_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
EVIDENCE_DIR="$SKILL_DIR/evidence/$EVIDENCE_ID"

if [[ ! -f "$INSTANCE_FILE" ]]; then
  echo "FAIL: no instance.json — run scripts/launch.sh first." >&2
  exit 1
fi

CAIRN_HOME="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$INSTANCE_FILE','utf8')).cairnHome)")"
CAIRN_DB_PATH="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$INSTANCE_FILE','utf8')).dbPath)")"

mkdir -p "$EVIDENCE_DIR"

CAIRN_HOME="$CAIRN_HOME" CAIRN_DB_PATH="$CAIRN_DB_PATH" node "$REPO_ROOT/bin/cairn.mjs" recall \
  >"$EVIDENCE_DIR/cli-recall.json"

node -e "
const b = JSON.parse(require('fs').readFileSync('$EVIDENCE_DIR/cli-recall.json', 'utf8'));
if (b.kind !== 'recalled') {
  console.error('FAIL: cli recall kind is', b.kind);
  process.exit(1);
}
if (!Array.isArray(b.beliefs) || b.beliefs.length < 1) {
  console.error('FAIL: cli recall returned no beliefs');
  process.exit(1);
}
console.log('OK: cli recall returned', b.beliefs.length, 'beliefs');
" >&2

cat >"$EVIDENCE_DIR/summary.txt" <<EOF
feature: cli-init-recall
cairnHome: $CAIRN_HOME
result: pass
EOF

echo "$EVIDENCE_DIR"
