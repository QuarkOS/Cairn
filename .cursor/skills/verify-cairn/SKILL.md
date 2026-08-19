---
name: verify-cairn
description: Launch an isolated Cairn dev instance, drive the HTTP API or desk UI, and capture proof artifacts. Use when verifying Cairn behavior after code changes, before release, or when asked to prove assert/recall/retract works end-to-end.
---

# Verify Cairn

Cairn is a Next.js desk plus JSON/MCP API on port **4721** by default. Verification uses a **separate production instance on port 14721** with its own `CAIRN_HOME` scratch directory. Next.js allows only one `next dev` process per repo, so the verify instance runs `npm run start` after `npm run build` — it can run alongside your normal `cairn dev` on 4721.

**Primary surface:** HTTP API (`GET/POST /api/cairn`) and the desk at `/`.  
**Secondary:** CLI (`node bin/cairn.mjs …`) and stdio MCP (`cairn mcp`).

Feature map: [`features/README.md`](features/README.md).

## Launch

From the repo root:

```bash
chmod +x .cursor/skills/verify-cairn/scripts/*.sh
.cursor/skills/verify-cairn/scripts/launch.sh
```

This:

1. Creates `.cursor/skills/verify-cairn/scratch/<run-id>/` with an isolated `CAIRN_HOME`
2. Runs `node bin/cairn.mjs init --project` against that home (via env override)
3. Runs `npm run build`, then `npm run start -- --port 14721` in tmux session `cairn-verify-<run-id>`
4. Waits until `GET http://127.0.0.1:14721/api/cairn` succeeds
5. Writes `.cursor/skills/verify-cairn/scratch/instance.json` (session name, port, paths)

**Ready signal:** `curl -sf http://127.0.0.1:14721/api/cairn` returns JSON with `"kind":"recalled"`.

**Teardown:** always run cleanup when finished (success or failure):

```bash
.cursor/skills/verify-cairn/scripts/cleanup.sh
```

Override port with `VERIFY_CAIRN_PORT=14722 scripts/launch.sh` if 14721 is taken.

**Do not** run a second `launch.sh` while `instance.json` exists — cleanup first. Refusing to double-drive avoids corrupting the shared verification instance.

## Doctor

Run before driving whenever anything looks off:

```bash
.cursor/skills/verify-cairn/scripts/doctor.sh
```

Checks:

- `scratch/instance.json` exists
- The tmux session named in that file is alive
- `GET /api/cairn` on the verify port returns `kind: recalled`
- `CAIRN_HOME` directory exists

Exit 0 prints `OK: session=… port=…`. Non-zero means launch again or cleanup stale state.

## Drive

Pick a feature from [`features/README.md`](features/README.md). Prefer the HTTP path when proving persistence; use the browser when proving desk UX.

### HTTP API — assert + recall (default proof)

```bash
.cursor/skills/verify-cairn/scripts/drive-api-assert-recall.sh
```

Posts a unique assert to `POST /api/cairn`, recalls via `GET /api/cairn`, validates the belief appears with the expected value, and optionally confirms the row in SQLite. Prints the evidence directory path on success.

Manual equivalent:

```bash
PORT=14721
curl -sf "http://127.0.0.1:${PORT}/api/cairn" \
  -H 'content-type: application/json' \
  -d '{"kind":"assert","idempotencyKey":"manual-1","onConflict":"fail","draft":{"entity":"env:verify","attribute":"verify.marker","value":{"kind":"text","text":"hello"},"provenance":{"kind":"observed","command":"curl","session":"verify"},"validity":{"kind":"until-superseded"}}}'
curl -sf "http://127.0.0.1:${PORT}/api/cairn" | node -e "const b=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(b.beliefs.filter(x=>x.current.attribute==='verify.marker').length)"
```

### Desk UI — Agent API panel (browser)

Requires a running verify instance (`launch.sh` + `doctor.sh`).

1. Open `http://127.0.0.1:14721/`
2. In the right **Agent API** card, click the **Assert** tab (`role=tab`, name `Assert`)
3. Edit the JSON `idempotencyKey` to a unique value; set `draft.attribute` to `desk.verify.marker`
4. Click **Send request**
5. Confirm the **Response** pane shows `"kind": "asserted"`
6. Confirm the left **Live beliefs** table lists `desk.verify.marker` (search with `aria-label="Search beliefs"` if needed)

Use the Browser-use MCP or `computerUse` subagent for screenshots. Do not use `POST /api/cairn/reset` as a user shortcut — it is dev-only and not part of the agent contract.

### CLI recall

With `instance.json` present, read `cairnHome` and run:

```bash
CAIRN_HOME=<from instance.json> CAIRN_DB_PATH=<from instance.json> node bin/cairn.mjs recall
```

Stdout must be JSON with `"kind":"recalled"`.

## Evidence

Each drive writes to:

```
.cursor/skills/verify-cairn/evidence/<timestamp>-<pid>/
```

Typical files:

| File | Contents |
| --- | --- |
| `recall-before.json` | Beliefs before the action |
| `assert-response.json` | POST assert response |
| `recall-after.json` | Beliefs after the action |
| `db-facts.txt` | Raw fact rows from SQLite (when `sqlite3` is available) |
| `summary.txt` | Human-readable pass/fail metadata |

**Proof standards:**

- Exercise the real user/agent path (`POST /api/cairn` or desk **Send request**), not in-process store calls
- Capture both the action (request body) and resulting state (recall JSON + DB when possible)
- Verify side effects in SQLite alongside the HTTP response
- Do not mock the store; the verify instance uses real SQLite under scratch `CAIRN_HOME`

Evidence survives `cleanup.sh`. Commit evidence only when explicitly asked; it is gitignored by default.

## Cleanup

```bash
.cursor/skills/verify-cairn/scripts/cleanup.sh
```

Kills the tmux session recorded in `instance.json`, removes that run's scratch directory, and deletes `instance.json`. **Does not** delete `evidence/`.

After cleanup, confirm proof still exists:

```bash
ls .cursor/skills/verify-cairn/evidence/
```

Never `pkill node` or `killall` — only kill the named tmux session from `instance.json`.

## Helpers

All scripts live in `.cursor/skills/verify-cairn/scripts/` and must be executable (`chmod +x`).

| Script | Purpose |
| --- | --- |
| `launch.sh` | Isolated production instance on port 14721 |
| `doctor.sh` | Pre-flight health check |
| `drive-api-assert-recall.sh` | HTTP assert + recall proof |
| `drive-canvas.sh` | Canvas page + layout API proof |
| `drive-cli-recall.sh` | CLI recall JSON proof |
| `drive-retract.sh` | POST retract + absent from recall |
| `cleanup.sh` | Tear down instance, keep evidence |

## Maintenance

When routes, ports, selectors, or the JSON contract change, update the matching file under `features/` and re-run this skill end-to-end. Use `/maintain-verification-skill` for the maintenance workflow.
