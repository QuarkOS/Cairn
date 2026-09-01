# Retract fact

## Sub-features

- `POST /api/cairn` with `kind: retract`, `factId`, `idempotencyKey`, `reason`, `session`
- Desk row **Retract** button (same JSON contract under the hood)
- Retracted facts absent from live recall but remain in store history
- MCP `cairn_retract` is a sibling surface for the same contract (stdio). It is not a replacement for the HTTP or desk proof below.

## How to get to it (user POV)

**API:** POST retract JSON to `/api/cairn`.  
**Desk:** Click **Retract** on a table row, or use the **Retract** tab in Agent API with a known `factId`.  
**MCP:** call `cairn_retract` from a connected client. Prove persistence with HTTP/desk, not MCP alone.

## Driving it with curl

1. `launch.sh` + `doctor.sh`
2. Recall to pick a live `factId`:

```bash
PORT=14721
FACT_ID=$(curl -sf "http://127.0.0.1:${PORT}/api/cairn" | node -e "const b=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(b.beliefs[0].current.id)")
curl -sf "http://127.0.0.1:${PORT}/api/cairn" -H 'content-type: application/json' -d "{\"kind\":\"retract\",\"idempotencyKey\":\"verify-retract-1\",\"factId\":\"$FACT_ID\",\"reason\":\"verify\",\"session\":\"verify\"}"
curl -sf "http://127.0.0.1:${PORT}/api/cairn" | node -e "const b=JSON.parse(require('fs').readFileSync(0,'utf8')); if(b.beliefs.some(x=>x.current.id==='$FACT_ID')) process.exit(1); console.log('retracted ok')"
```

Or `../scripts/drive-retract.sh`.

## Gotchas

- Retract on an already-retracted fact returns a rejection with remedy — pick a live head.
- Desk sample retract targets seed fact `f-0117`; if already retracted, choose another id from recall.
- Idempotency replay: same key + same body returns the original retract result without double-write.
- `cairn_retract` over MCP exercises the same store, but verification evidence for this feature is the HTTP POST plus absent-from-recall check (and desk **Retract** when proving UX).
