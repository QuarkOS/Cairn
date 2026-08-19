# Cairn verification feature map

Index of user-facing features and how to prove each one. Run `../scripts/launch.sh` and `../scripts/doctor.sh` before any drive. Always `../scripts/cleanup.sh` when done.

| Feature | Surface | Drive doc | Primary proof |
| --- | --- | --- | --- |
| HTTP assert + recall | API | [http-api-assert-recall.md](http-api-assert-recall.md) | `scripts/drive-api-assert-recall.sh` |
| Desk beliefs table | Web UI | [desk-beliefs-table.md](desk-beliefs-table.md) | Browser: search + entity chips + table rows |
| Agent API panel | Web UI | [desk-agent-api.md](desk-agent-api.md) | Browser: tabs + Send request + Response pane |
| CLI init + recall | CLI | [cli-init-recall.md](cli-init-recall.md) | `scripts/drive-cli-recall.sh` |
| Agent canvas | Web UI | [agent-canvas.md](agent-canvas.md) | `scripts/drive-canvas.sh` |
| Retract fact | API / desk | [retract-fact.md](retract-fact.md) | `scripts/drive-retract.sh` |

Default smoke proof: **HTTP assert + recall** — fastest, checks persistence.

Evidence directory: `../evidence/<run>/`.
