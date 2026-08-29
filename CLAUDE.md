# Cairn

Project facts go through `cairn_assert`, `cairn_recall`, and `cairn_retract`. Do not write them into MEMORY.md.

Every write needs an `idempotencyKey`. Reuse a key only to replay the same body. Branch on `response.kind`. A rejection includes `error.remedy.kind`.

Facts are append-only and typed. Retract or supersede. Do not edit a row, send free-form JSON values, or search by meaning. Do not wait on a human in the middle of a request.

Call `cairn_recall` at the start of a session before you rely on a persisted fact. Each belief has `freshness` and `assurance`. Treat stale or expired as not current.

This checkout does not commit `.mcp.json`. That file stores an absolute `CAIRN_HOME`, which is different on every machine.

```bash
npm install
node bin/cairn.mjs init --project
```

Init creates `.cairn/`, writes Cursor config at `.cursor/mcp.json`, and writes `.mcp.json` for Claude Code and Pi. The shared file uses an absolute `CAIRN_HOME`. It must not use Cursor's `${workspaceFolder}`. Approve the project MCP server when Claude Code asks.

`CAIRN_HOME` resolution:

1. `CAIRN_HOME` if set
2. `./.cairn` if that directory exists
3. `~/.cairn`

The desk listens on port 4721. The npm package is `@quarkos/cairn`.

`AGENTS.md` is Next.js agent-files text. It is not the fact contract. `next.config.ts` sets `agentRules: false`, so `next dev` should not rewrite this file.
