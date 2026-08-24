# Desk beliefs table

## Sub-features

- Live beliefs table (entity, attribute, value, status, retract action)
- Search bar (`aria-label="Search beliefs"`)
- Entity filter chips (All + per-entity)
- Sticky header + scrollable body
- Empty state when no beliefs; “No matching beliefs” when filters exclude all rows

## How to get to it (user POV)

1. Start Cairn: `npx --yes @quarkos/cairn dev` or the verify `launch.sh`
2. Open `http://127.0.0.1:<port>/`
3. The main column shows **Live beliefs** with count and `recalled <timestamp>`

## Driving it with browser (CDP / Browser-use)

1. Navigate to the verify desk URL
2. Confirm table headers: Entity, Attribute, Value, Status
3. Type in the search input — row count should shrink to matching beliefs
4. Click an entity chip (e.g. `staging`) — only that entity's rows remain
5. Click **All** — full list returns

After an assert (via API or Agent panel), the new attribute must appear without reload.

## Gotchas

- Initial beliefs are empty after `init --project`. Verify launch uses `--demo` so the table starts with ~10 sample facts. `POST /api/cairn/reset` reloads that same demo set.
- Search matches entity, attribute, value, provenance text, and freshness label.
- Entity chips overflow into “+N more” when there are more than five entities.
