#!/usr/bin/env bash
# POST retract and confirm fact absent from live recall.
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

RECALL="$(curl -sf "http://127.0.0.1:${PORT}/api/cairn")"
echo "$RECALL" >"$EVIDENCE_DIR/recall-before.json"

FACT_ID="$(node -e "
const b = JSON.parse(require('fs').readFileSync('$EVIDENCE_DIR/recall-before.json', 'utf8'));
const id = b.beliefs?.[0]?.current?.id;
if (!id) process.exit(1);
console.log(id);
")"

RETRACT_BODY="$(cat <<EOF
{
  "kind": "retract",
  "idempotencyKey": "verify-retract-$EVIDENCE_ID",
  "factId": "$FACT_ID",
  "reason": "verify-cairn drive-retract",
  "session": "verify"
}
EOF
)"

curl -sf "http://127.0.0.1:${PORT}/api/cairn" \
  -H 'content-type: application/json' \
  -d "$RETRACT_BODY" >"$EVIDENCE_DIR/retract-response.json"

RECALL_AFTER="$(curl -sf "http://127.0.0.1:${PORT}/api/cairn")"
echo "$RECALL_AFTER" >"$EVIDENCE_DIR/recall-after.json"

node -e "
const retract = JSON.parse(require('fs').readFileSync('$EVIDENCE_DIR/retract-response.json', 'utf8'));
const after = JSON.parse(require('fs').readFileSync('$EVIDENCE_DIR/recall-after.json', 'utf8'));
if (retract.kind !== 'retracted') {
  console.error('FAIL: retract response kind is', retract.kind);
  process.exit(1);
}
if (after.beliefs?.some((b) => b.current.id === '$FACT_ID')) {
  console.error('FAIL: retracted fact still in recall');
  process.exit(1);
}
console.log('OK: retract removed fact $FACT_ID from live recall');
" >&2

cat >"$EVIDENCE_DIR/summary.txt" <<EOF
feature: retract-fact
port: $PORT
factId: $FACT_ID
result: pass
EOF

echo "$EVIDENCE_DIR"
