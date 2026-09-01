---
name: cairn-assert
description: Assert typed Cairn facts via cairn_assert after a decision, deploy, URL, or command actually lands. Unique idempotencyKey; onConflict supersede for live facts. Use with @quarkos/cairn. Do not invent facts. Does not inject into Cursor cloud agent VMs.
---

# Assert Cairn facts

Call `cairn_assert` after a decision, deploy, URL, or command actually lands. Do not invent facts, and do not assert a plan as if it had already happened.

Every write needs a unique `idempotencyKey`. Reuse a key only to replay the same body. For live facts, set `onConflict` to `supersede`. Branch on `response.kind`. A rejection includes `error.remedy.kind`.

When a live fact is no longer true, call `cairn_retract` (or supersede it with a new assert). Do not edit a row in place.

Organize around the fact shape (`entity`, `attribute`, typed `value`, `provenance`, `validity`). Value kinds are `text`, `instant`, `reference`, `quantity`, and `flag`. Provenance kinds are `told`, `observed`, and `inferred`.

The npm package is **`@quarkos/cairn`**. Never the unscoped `cairn` package.

## Limit

This plugin helps Cursor IDE users on the installer's machine. It does not inject facts into Cursor cloud agent VMs. Those remotes cannot see the installer's SQLite store.
