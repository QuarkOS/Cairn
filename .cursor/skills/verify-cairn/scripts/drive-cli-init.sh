#!/usr/bin/env bash
# Prove CLI init --project ignores CAIRN_HOME, --demo refuses a non-empty
# store, and recall treats empty / literal ${CAIRN_HOME} as unset.
# Does not need a verify desk instance.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"
EVIDENCE_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
EVIDENCE_DIR="$SKILL_DIR/evidence/$EVIDENCE_ID"
BIN="$REPO_ROOT/bin/cairn.mjs"

mkdir -p "$EVIDENCE_DIR"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/cairn-cli-init-XXXXXX")"
cleanup_tmp() { rm -rf "$TMP"; }
trap cleanup_tmp EXIT

# --- init --project always uses <cwd>/.cairn and ignores CAIRN_HOME ---
PROJECT="$TMP/proj"
OTHER_HOME="$TMP/other-home"
mkdir -p "$PROJECT" "$OTHER_HOME"
set +e
(
  cd "$PROJECT"
  unset CAIRN_DB_PATH
  export CAIRN_HOME="$OTHER_HOME"
  node "$BIN" init --project >"$EVIDENCE_DIR/init-project-stdout.txt" 2>"$EVIDENCE_DIR/init-project-stderr.txt"
)
INIT_RC=$?
set -e
if [[ "$INIT_RC" -ne 0 ]]; then
  echo "FAIL: init --project exited $INIT_RC" >&2
  cat "$EVIDENCE_DIR/init-project-stderr.txt" >&2
  exit 1
fi

if [[ ! -d "$PROJECT/.cairn" ]]; then
  echo "FAIL: init --project did not create <cwd>/.cairn" >&2
  exit 1
fi
if [[ -f "$OTHER_HOME/cairn.db" ]]; then
  echo "FAIL: init --project honored CAIRN_HOME instead of <cwd>/.cairn" >&2
  exit 1
fi
if ! grep -q "$PROJECT/.cairn" "$EVIDENCE_DIR/init-project-stdout.txt"; then
  echo "FAIL: init --project stdout did not mention <cwd>/.cairn" >&2
  exit 1
fi
echo "OK: init --project ignored CAIRN_HOME=$OTHER_HOME" >&2

# --- --demo seeds empty store, refuses a second run ---
DEMO="$TMP/demo"
mkdir -p "$DEMO"
set +e
(
  cd "$DEMO"
  unset CAIRN_HOME CAIRN_DB_PATH
  node "$BIN" init --project --demo >"$EVIDENCE_DIR/init-demo-stdout.txt" 2>"$EVIDENCE_DIR/init-demo-stderr.txt"
)
DEMO_FIRST=$?
set -e
if [[ "$DEMO_FIRST" -ne 0 ]]; then
  echo "FAIL: first init --project --demo exited $DEMO_FIRST" >&2
  cat "$EVIDENCE_DIR/init-demo-stderr.txt" >&2
  exit 1
fi
if ! grep -q "Loaded sample beliefs" "$EVIDENCE_DIR/init-demo-stdout.txt"; then
  echo "FAIL: first init --project --demo did not load sample beliefs" >&2
  exit 1
fi

set +e
(
  cd "$DEMO"
  unset CAIRN_HOME CAIRN_DB_PATH
  node "$BIN" init --project --demo >"$EVIDENCE_DIR/init-demo-second-stdout.txt" 2>"$EVIDENCE_DIR/init-demo-second-stderr.txt"
)
DEMO_SECOND=$?
set -e
if [[ "$DEMO_SECOND" -eq 0 ]]; then
  echo "FAIL: second init --project --demo should refuse a non-empty store" >&2
  exit 1
fi
if ! grep -q "Refusing --demo because the Cairn store is not empty" "$EVIDENCE_DIR/init-demo-second-stderr.txt"; then
  echo "FAIL: second --demo did not print the empty-store refusal" >&2
  cat "$EVIDENCE_DIR/init-demo-second-stderr.txt" >&2
  exit 1
fi
echo "OK: --demo refused a non-empty store" >&2

# --- overlay: empty string and literal ${CAIRN_HOME} treated as unset ---
set +e
(
  cd "$DEMO"
  unset CAIRN_DB_PATH
  CAIRN_HOME="" node "$BIN" recall >"$EVIDENCE_DIR/recall-empty-home.json" 2>"$EVIDENCE_DIR/recall-empty-home.stderr"
  empty_rc=$?
  CAIRN_HOME='${CAIRN_HOME}' node "$BIN" recall >"$EVIDENCE_DIR/recall-placeholder-home.json" 2>"$EVIDENCE_DIR/recall-placeholder-home.stderr"
  placeholder_rc=$?
  exit $(( empty_rc != 0 ? empty_rc : placeholder_rc ))
)
OVERLAY_RC=$?
set -e
if [[ "$OVERLAY_RC" -ne 0 ]]; then
  echo "FAIL: overlay recall exited $OVERLAY_RC" >&2
  cat "$EVIDENCE_DIR/recall-empty-home.stderr" "$EVIDENCE_DIR/recall-placeholder-home.stderr" >&2
  exit 1
fi

node -e "
const fs = require('fs');
for (const file of ['recall-empty-home.json', 'recall-placeholder-home.json']) {
  const b = JSON.parse(fs.readFileSync('$EVIDENCE_DIR/' + file, 'utf8'));
  if (b.kind !== 'recalled') {
    console.error('FAIL:', file, 'kind is', b.kind);
    process.exit(1);
  }
  if (!Array.isArray(b.beliefs) || b.beliefs.length < 1) {
    console.error('FAIL:', file, 'returned no beliefs (overlay did not fall through to ./.cairn)');
    process.exit(1);
  }
}
console.log('OK: empty and \${CAIRN_HOME} recall used ./.cairn');
" >&2

cat >"$EVIDENCE_DIR/summary.txt" <<EOF
feature: cli-init-recall
result: pass
initProjectHome: $PROJECT/.cairn
ignoredCairnHome: $OTHER_HOME
demoHome: $DEMO/.cairn
overlay: empty-string and literal \${CAIRN_HOME} treated as unset
EOF

echo "$EVIDENCE_DIR"
