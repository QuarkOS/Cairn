#!/usr/bin/env bash
# Prove Cursor Agent Plugin source layout. Does not need a verify desk.
# Does not inject into Cursor IDE or cloud VMs.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"
EVIDENCE_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
EVIDENCE_DIR="$SKILL_DIR/evidence/$EVIDENCE_ID"

mkdir -p "$EVIDENCE_DIR"

required=(
  "plugin.json"
  "mcp.json"
  ".cursor-plugin/plugin.json"
  "skills/cairn-recall/SKILL.md"
  "skills/cairn-assert/SKILL.md"
)

missing=0
for rel in "${required[@]}"; do
  if [[ ! -f "$REPO_ROOT/$rel" ]]; then
    echo "FAIL: missing $rel" >&2
    missing=1
  fi
done
if [[ "$missing" -ne 0 ]]; then
  exit 1
fi

cp "$REPO_ROOT/plugin.json" "$EVIDENCE_DIR/plugin.json"
cp "$REPO_ROOT/mcp.json" "$EVIDENCE_DIR/mcp.json"
cp "$REPO_ROOT/.cursor-plugin/plugin.json" "$EVIDENCE_DIR/cursor-plugin.json"

node -e "
const fs = require('fs');
const path = require('path');
const evidence = process.argv[1];
const mcp = JSON.parse(fs.readFileSync(path.join(evidence, 'mcp.json'), 'utf8'));
const plugin = JSON.parse(fs.readFileSync(path.join(evidence, 'plugin.json'), 'utf8'));
const overlay = JSON.parse(fs.readFileSync(path.join(evidence, 'cursor-plugin.json'), 'utf8'));
const dump = JSON.stringify({ mcp, plugin, overlay });
if (dump.includes('/home/box/cairn-loop/.cairn')) {
  console.error('FAIL: plugin manifests pin coordinator path /home/box/cairn-loop/.cairn');
  process.exit(1);
}
const server = mcp.mcpServers?.cairn;
if (!server) {
  console.error('FAIL: mcp.json missing mcpServers.cairn');
  process.exit(1);
}
const args = Array.isArray(server.args) ? server.args.join(' ') : '';
if (server.command !== 'npx' || !args.includes('@quarkos/cairn')) {
  console.error('FAIL: mcp.json must invoke npx -y @quarkos/cairn mcp, got', server.command, args);
  process.exit(1);
}
if (args.split(/\s+/).includes('cairn') && !args.includes('@quarkos/cairn')) {
  console.error('FAIL: unscoped cairn package in mcp args');
  process.exit(1);
}
if (plugin.name !== 'cairn') {
  console.error('FAIL: plugin.json name is', plugin.name);
  process.exit(1);
}
if (!overlay.variables?.properties?.CAIRN_HOME) {
  console.error('FAIL: .cursor-plugin/plugin.json missing optional CAIRN_HOME variable');
  process.exit(1);
}
if (server.env?.CAIRN_HOME !== '\${CAIRN_HOME}') {
  console.error('FAIL: mcp.json CAIRN_HOME should be the Configure placeholder \${CAIRN_HOME}, got', server.env?.CAIRN_HOME);
  process.exit(1);
}
console.log('OK: plugin manifests name=cairn npm=@quarkos/cairn overlay=CAIRN_HOME no coordinator pin');
" "$EVIDENCE_DIR" >&2

cat >"$EVIDENCE_DIR/summary.txt" <<EOF
feature: cursor-agent-plugin
result: pass
surface: plugin.json + mcp.json + .cursor-plugin/plugin.json + skills cairn-recall/cairn-assert
limit: IDE on installer machine; does not inject into Cursor cloud VMs
npm: @quarkos/cairn
published-guard: 0.4.6 ships empty-string / \${CAIRN_HOME} overlay; this script proves checkout layout only
EOF

echo "$EVIDENCE_DIR"
