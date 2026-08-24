#!/usr/bin/env bash
# Drive the HTTP API: assert a fact, recall it, capture evidence.
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
DB_PATH="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$INSTANCE_FILE','utf8')).dbPath)")"
KEY="verify-assert-$EVIDENCE_ID"
ATTR="verify.marker"
ENTITY="env:verify"
VALUE="proof-$EVIDENCE_ID"

mkdir -p "$EVIDENCE_DIR"

RECALL_BEFORE="$(curl -sf "http://127.0.0.1:${PORT}/api/cairn")"
echo "$RECALL_BEFORE" >"$EVIDENCE_DIR/recall-before.json"

ASSERT_BODY="$(cat <<EOF
{
  "kind": "assert",
  "idempotencyKey": "$KEY",
  "onConflict": "fail",
  "draft": {
    "entity": "$ENTITY",
    "attribute": "$ATTR",
    "value": { "kind": "text", "text": "$VALUE" },
    "provenance": {
      "kind": "observed",
      "command": "verify-cairn drive-api-assert-recall",
      "session": "verify"
    },
    "validity": { "kind": "until-superseded" }
  }
}
EOF
)"

ASSERT_RESPONSE="$(curl -sf "http://127.0.0.1:${PORT}/api/cairn" \
  -H 'content-type: application/json' \
  -d "$ASSERT_BODY")"
echo "$ASSERT_RESPONSE" >"$EVIDENCE_DIR/assert-response.json"

RECALL_AFTER="$(curl -sf "http://127.0.0.1:${PORT}/api/cairn")"
echo "$RECALL_AFTER" >"$EVIDENCE_DIR/recall-after.json"

node -e "
const fs = require('fs');
const assert = JSON.parse(fs.readFileSync('$EVIDENCE_DIR/assert-response.json', 'utf8'));
const after = JSON.parse(fs.readFileSync('$EVIDENCE_DIR/recall-after.json', 'utf8'));
if (assert.kind !== 'asserted') {
  console.error('FAIL: assert response kind is', assert.kind);
  process.exit(1);
}
const hit = after.beliefs?.find(
  (b) => b.current.entity === '$ENTITY' && b.current.attribute === '$ATTR'
);
if (!hit) {
  console.error('FAIL: recalled beliefs missing $ENTITY / $ATTR');
  process.exit(1);
}
if (hit.current.value.text !== '$VALUE') {
  console.error('FAIL: value mismatch', hit.current.value.text);
  process.exit(1);
}
console.log('OK: assert persisted and recalled');
" >&2

if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB_PATH" "SELECT body FROM facts WHERE id IN (SELECT id FROM facts);" \
    >"$EVIDENCE_DIR/db-facts.txt" 2>/dev/null || true
  if ! grep -q "$VALUE" "$EVIDENCE_DIR/db-facts.txt"; then
    echo "FAIL: SQLite file at $DB_PATH does not contain asserted value." >&2
    exit 1
  fi
fi

cat >"$EVIDENCE_DIR/summary.txt" <<EOF
feature: http-api-assert-recall
port: $PORT
dbPath: $DB_PATH
idempotencyKey: $KEY
entity: $ENTITY
attribute: $ATTR
value: $VALUE
result: pass
EOF

echo "$EVIDENCE_DIR"
