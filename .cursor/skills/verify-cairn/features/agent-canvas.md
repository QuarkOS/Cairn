# Agent canvas

## Sub-features

- `/canvas` route with dot-grid board
- Agent pods grouped by `provenance.by` (told) or `provenance.session` (observed/inferred)
- Draggable pod containers with fact lists inside
- Layout persistence via `PUT /api/cairn/canvas` → `.cairn/canvas.json`
- Auto-refresh every 5s

## How to get to it (user POV)

1. Start Cairn (`cairn dev` or verify `launch.sh`)
2. Click **Canvas** in the header nav
3. Drag agent pods to arrange the board

## Driving it with scripts

```bash
../scripts/launch.sh
../scripts/doctor.sh
../scripts/drive-canvas.sh
```

Checks HTML contains "Agent canvas", PUT/GET layout API round-trip.

## Gotchas

- Layout file lives beside the database under `CAIRN_HOME`.
- `cairn dev` pins `CAIRN_HOME` to the directory you invoked it from (project `.cairn` after `init --project`).
- Canvas uses production build in verify mode (port 14721).
- Empty canvas when no beliefs exist yet. Verify launch uses `--demo` so pods appear.
