---
name: cairn-recall
description: Recall typed Cairn facts via cairn_recall at session or task start, before relying on persisted project beliefs. Use with @quarkos/cairn. Do not invent facts. Does not inject into Cursor cloud agent VMs.
---

# Recall Cairn facts

Call `cairn_recall` at the start of a session or task, and again before you rely on a persisted project fact.

Do not invent facts. If recall returns nothing for that entity or attribute, say so. Each belief has `freshness` and `assurance`. Treat stale or expired beliefs as not current.

Organize around the fact shape (`entity`, `attribute`, typed `value`, `provenance`, `validity`). Do not dump raw rows or search by meaning.

The npm package is **`@quarkos/cairn`**. Never the unscoped `cairn` package.

## Limit

This plugin helps Cursor IDE users on the installer's machine. It does not inject facts into Cursor cloud agent VMs. Those remotes cannot see the installer's SQLite store.
