# HTTP assert + recall

## Sub-features

- `GET /api/cairn` — recall all live beliefs (`kind: recalled`)
- `POST /api/cairn` with `kind: assert` — write a new fact
- Idempotency via `idempotencyKey`
- SQLite persistence under `CAIRN_HOME/cairn.db`

## How to get to it (user POV)

Agents and integrators send JSON to `http://127.0.0.1:<port>/api/cairn`. Humans can use the desk **Agent API** panel, which hits the same route. No auth.

## Driving it with curl + scripts

1. `../scripts/launch.sh` then `../scripts/doctor.sh`
2. `../scripts/drive-api-assert-recall.sh`

Or manually read `port` from `../scratch/instance.json` and POST/GET as documented in `../SKILL.md`.

## Gotchas

- Use the **verify port** (14721), not the default dev port (4721), unless you intentionally share the developer instance.
- The verify instance runs **production** `next start` so it can coexist with `cairn dev`; rebuild if you changed app code since last `launch.sh`.
- `onConflict: fail` is safest for proofs — avoids silently superseding seed data.
- `POST /api/cairn/reset` re-seeds demo data; do not use it as proof of assert behavior.
- Assert responses use `kind: asserted`; rejections use `kind: rejected` with `error.remedy`.
