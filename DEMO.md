# Claude Code on this checkout

Clone the branch, install, then init. Init writes `.mcp.json` with an absolute `CAIRN_HOME` for your machine. That file is gitignored on purpose. Committing this VM's path would make the demo lie on yours.

```bash
npm install
node bin/cairn.mjs init --project
```

Claude Code reads `.mcp.json` at session start and asks once to approve the project server. Cursor gets `.cursor/mcp.json`, which may use `${workspaceFolder}`. Do not copy that variable into `.mcp.json`.

`CLAUDE.md` is the rule. Project facts go through `cairn_assert`, `cairn_recall`, and `cairn_retract`.

If you are wiring a different project, `npx --yes @quarkos/cairn init --project` is the published equivalent. This checkout should use `node bin/cairn.mjs` so MCP talks to the code you just cloned.

## Two sessions

These facts are about this package. Session one writes them. Session two starts a new process, recalls with freshness, then retracts one.

| idempotencyKey | entity | attribute | value |
| --- | --- | --- | --- |
| `demo-s1-desk-port` | `repo:QuarkOS/Cairn` | `desk.port` | `4721` tcp-port |
| `demo-s1-npm-name` | `repo:QuarkOS/Cairn` | `npm.name` | `@quarkos/cairn` |
| `demo-s1-cairn-home-resolution` | `repo:QuarkOS/Cairn` | `cairn.home.resolution` | `CAIRN_HOME, else ./.cairn, else ~/.cairn` |

In Claude Code that is three `cairn_assert` calls (`onConflict: "fail"`, `validity: { "kind": "until-superseded" }`), then a later session of `cairn_recall` plus `cairn_retract`.

Same writes from the shell, after init:

```bash
npx tsx demo/two-session.ts session-1
npx tsx demo/two-session.ts session-2
```

Or both, each in its own process:

```bash
npx tsx demo/two-session.ts
```

`node bin/cairn.mjs recall` prints the same store.

The script calls `handleRequest`, the same function the MCP tools and CLI use. Session two is a new Node process, so the beliefs come from SQLite, not from memory in the first process.

Re-run only on an empty project store. Replay of the same idempotency keys returns the original responses. Retracting a fact that is already gone is `rejected` with `error.remedy.kind`.

## Proof from this PR

Ran `node bin/cairn.mjs init --project` in this checkout, then `npx tsx demo/two-session.ts` against `./.cairn`. Init wrote `.mcp.json` with `command: npx`, `args` pointing at this checkout, and an absolute `CAIRN_HOME` of `<clone>/.cairn`. No `${workspaceFolder}` in `.mcp.json`. Those generated files stayed untracked.

### Session one

```
npx tsx demo/two-session.ts session-1
```

`demo-s1-desk-port` → `kind: "asserted"`, `factId: "f-0001"`, `desk.port` = 4721 tcp-port

`demo-s1-npm-name` → `kind: "asserted"`, `factId: "f-0002"`, `npm.name` = `@quarkos/cairn`

`demo-s1-cairn-home-resolution` → `kind: "asserted"`, `factId: "f-0003"`, `cairn.home.resolution` = `CAIRN_HOME, else ./.cairn, else ~/.cairn`

### Session two

```
npx tsx demo/two-session.ts session-2
```

Cold recall (`kind: "recalled"`, `recalledAt: "2026-08-29T14:11:46.963Z"`):

```json
[
  {
    "factId": "f-0001",
    "attribute": "desk.port",
    "freshness": "fresh",
    "assurance": { "kind": "observed" }
  },
  {
    "factId": "f-0002",
    "attribute": "npm.name",
    "freshness": "fresh",
    "assurance": { "kind": "observed" }
  },
  {
    "factId": "f-0003",
    "attribute": "cairn.home.resolution",
    "freshness": "fresh",
    "assurance": { "kind": "observed" }
  }
]
```

Retract `f-0003` with `demo-s2-retract-cairn-home-resolution` → `kind: "retracted"`.

Recall after retract (`kind: "recalled"`, `recalledAt: "2026-08-29T14:11:46.973Z"`): `f-0001` and `f-0002` still `fresh`. `cairn.home.resolution` is gone.

`node bin/cairn.mjs recall` then returned `kind: "recalled"` with the same two live beliefs, both `freshness: "fresh"`.
