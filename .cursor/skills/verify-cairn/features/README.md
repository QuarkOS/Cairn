# Cairn verification feature map

Index of user-facing features and how to prove each one.

Desk, HTTP, canvas, retract, and CLI **recall** need `../scripts/launch.sh` then `../scripts/doctor.sh` first. Always `../scripts/cleanup.sh` when that instance is done.

CLI **init** (`drive-cli-init.sh`) and the Cursor Agent Plugin (`drive-cursor-plugin.sh`) are file/CLI proofs. They do **not** need a verify desk — do not double-launch to run them.

| Feature | Surface | Drive doc | Primary proof |
| --- | --- | --- | --- |
| HTTP assert + recall | API | [http-api-assert-recall.md](http-api-assert-recall.md) | `scripts/drive-api-assert-recall.sh` |
| Desk beliefs table | Web UI | [desk-beliefs-table.md](desk-beliefs-table.md) | Browser: search + full-id chips (`env:staging`) + table rows. Desk does not poll. |
| Agent API panel | Web UI | [desk-agent-api.md](desk-agent-api.md) | Browser: tabs + Send request + Response pane |
| CLI init + recall | CLI | [cli-init-recall.md](cli-init-recall.md) | `scripts/drive-cli-init.sh` (no desk); `scripts/drive-cli-recall.sh` (with instance) |
| Agent canvas | Web UI | [agent-canvas.md](agent-canvas.md) | `scripts/drive-canvas.sh` |
| Retract fact | API / desk | [retract-fact.md](retract-fact.md) | `scripts/drive-retract.sh` (HTTP). MCP `cairn_retract` is a sibling, not the proof. |
| Cursor Agent Plugin | Plugin / MCP | [cursor-agent-plugin.md](cursor-agent-plugin.md) | `scripts/drive-cursor-plugin.sh` (files only; no IDE injection) |

Default smoke proof: **HTTP assert + recall** — fastest, checks persistence.

Evidence directory: `../evidence/<run>/`.
