# Desk beliefs table

## Sub-features

- Live beliefs table (entity, attribute, value, status, retract action)
- Search bar (`aria-label="Search beliefs"`)
- Entity filter chips labeled with **full ids** (`env:staging`, `user:mira`, `repo:acme/checkout`, `ticket:PAY-812`) — not short names like `staging`
- Sticky header + scrollable body
- Empty state when no beliefs; “No matching beliefs” when filters exclude all rows
- No polling: the table loads once on mount and again after desk **Send request** or row **Retract**

## How to get to it (user POV)

1. Start Cairn: `npx --yes @quarkos/cairn dev` or the verify `launch.sh`
2. Open `http://127.0.0.1:<port>/`
3. The main column shows **Live beliefs** with count and `recalled <timestamp>`

## Driving it with browser (CDP / Browser-use)

1. Navigate to the verify desk URL
2. Confirm table headers: Entity, Attribute, Value, Status
3. Type in the search input — row count should shrink to matching beliefs
4. Click an entity chip labeled `env:staging` (full id) — only that entity's rows remain
5. Click **All** — full list returns

A `curl` assert against `/api/cairn` does **not** appear in the table until the user clicks **Send request**, **Retract**, or reloads the page. The desk does not poll.

Do not treat **+N more** as part of the demo proof. Overflow needs more than five distinct entities; `--demo` seeds four (`user:mira`, `repo:acme/checkout`, `env:staging`, `ticket:PAY-812`).

## Gotchas

- Initial beliefs are empty after `init --project`. Verify launch uses `--demo` so the table starts with ~10 sample facts. `POST /api/cairn/reset` reloads that same demo set.
- Search matches entity, attribute, value, provenance text, and freshness label.
- Chip labels are the full `entity` string. There is no chip named `staging`.
- Entity chips overflow into “+N more” only when there are more than five entities (`ENTITY_CHIP_LIMIT = 5`). Demo data has four, so the control is absent until you assert a sixth distinct entity.
- Canvas (`/canvas`) auto-refreshes every 5s; the desk table does not.
