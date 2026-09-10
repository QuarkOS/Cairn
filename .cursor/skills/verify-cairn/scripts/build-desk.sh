#!/usr/bin/env bash
# Skill-owned production build for the verify instance.
# Does not edit product tsconfig.json / next.config.* / package.json.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"
PRODUCT_TSCONFIG="$REPO_ROOT/tsconfig.json"
VERIFY_TSCONFIG="$SKILL_DIR/tsconfig.verify.json"
OVERLAY_TSCONFIG="${VERIFY_CAIRN_OVERLAY_TSCONFIG:-$SKILL_DIR/scratch/tsconfig.verify.generated.json}"
OVERLAY_HOOK="$SCRIPT_DIR/tsconfig-overlay.cjs"

if [[ ! -f "$PRODUCT_TSCONFIG" ]]; then
  echo "FAIL: product tsconfig missing at $PRODUCT_TSCONFIG" >&2
  exit 1
fi
if [[ ! -f "$VERIFY_TSCONFIG" ]]; then
  echo "FAIL: skill tsconfig missing at $VERIFY_TSCONFIG" >&2
  exit 1
fi
if [[ ! -f "$OVERLAY_HOOK" ]]; then
  echo "FAIL: tsconfig overlay hook missing at $OVERLAY_HOOK" >&2
  exit 1
fi

mkdir -p "$(dirname "$OVERLAY_TSCONFIG")"

# Flatten the skill tsconfig (extends product, excludes tests) so Next can
# typecheck through the product filename without a circular extends remap.
node -e "
const fs = require('fs');
const path = require('path');
const productPath = process.argv[1];
const verifyPath = process.argv[2];
const outPath = process.argv[3];
const product = JSON.parse(fs.readFileSync(productPath, 'utf8'));
const verify = JSON.parse(fs.readFileSync(verifyPath, 'utf8'));
const exclude = new Set([
  ...(Array.isArray(product.exclude) ? product.exclude : []),
  ...(Array.isArray(verify.exclude) ? verify.exclude : []),
]);
const overlay = { ...product, exclude: [...exclude] };
delete overlay.extends;
fs.writeFileSync(outPath, JSON.stringify(overlay, null, 2) + '\n');
" "$PRODUCT_TSCONFIG" "$VERIFY_TSCONFIG" "$OVERLAY_TSCONFIG"

export VERIFY_CAIRN_PRODUCT_TSCONFIG="$PRODUCT_TSCONFIG"
export VERIFY_CAIRN_TSCONFIG="$OVERLAY_TSCONFIG"
if [[ -n "${NODE_OPTIONS:-}" ]]; then
  export NODE_OPTIONS="--require ${OVERLAY_HOOK} ${NODE_OPTIONS}"
else
  export NODE_OPTIONS="--require ${OVERLAY_HOOK}"
fi

cd "$REPO_ROOT"
# Same compiler as npm run build, with tests excluded from typecheck.
npx next build
