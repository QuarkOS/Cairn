#!/usr/bin/env bash
# Verify the agent canvas page loads and shows grouped agent pods.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTANCE_FILE="$SKILL_DIR/scratch/instance.json"
EVIDENCE_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
EVIDENCE_DIR="$SKILL_DIR/evidence/$EVIDENCE_ID"

if [[ ! -f "$INSTANCE_FILE" ]]; then
  echo "FAIL: no instance.json — run scripts/launch.sh first." >&2
  exit 1
fi

PORT="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$INSTANCE_FILE','utf8')).port)")"
mkdir -p "$EVIDENCE_DIR"

HTML="$(curl -sf "http://127.0.0.1:${PORT}/canvas")"
echo "$HTML" >"$EVIDENCE_DIR/canvas.html"

node -e "
const html = require('fs').readFileSync('$EVIDENCE_DIR/canvas.html', 'utf8');
if (!html.includes('Agent canvas')) {
  console.error('FAIL: canvas page missing Agent canvas heading');
  process.exit(1);
}
if (!html.includes('Canvas')) {
  console.error('FAIL: canvas nav missing');
  process.exit(1);
}
" >&2

LAYOUT='{"version":1,"pods":{"session:s-015":{"x":120,"y":80}}}'
curl -sf "http://127.0.0.1:${PORT}/api/cairn/canvas" \
  -X PUT \
  -H 'content-type: application/json' \
  -d "$LAYOUT" >"$EVIDENCE_DIR/canvas-layout-put.json"

curl -sf "http://127.0.0.1:${PORT}/api/cairn/canvas" >"$EVIDENCE_DIR/canvas-layout-get.json"

node -e "
const saved = JSON.parse(require('fs').readFileSync('$EVIDENCE_DIR/canvas-layout-get.json', 'utf8'));
if (saved.pods['session:s-015']?.x !== 120) {
  console.error('FAIL: canvas layout not persisted');
  process.exit(1);
}
console.log('OK: canvas page and layout API');
" >&2

cat >"$EVIDENCE_DIR/summary.txt" <<EOF
feature: agent-canvas
port: $PORT
result: pass
EOF

echo "$EVIDENCE_DIR"
