# Cairn

Cairn is an append-only store of typed facts. An agent asserts a fact in one session and recalls it, with a freshness verdict, at the start of the next.

Facts persist in SQLite. The desk is optional. The work happens on JSON and MCP.

The npm package is **`@quarkos/cairn`**. Always use the scoped package name; the unscoped `cairn` name is an unrelated 2017 React Native styling package.

## Install

From any empty project folder (Node 20+):

```bash
npx --yes @quarkos/cairn --help
npx --yes @quarkos/cairn init --project
npx --yes @quarkos/cairn dev
```

The first command warms the npx cache. `init --project` creates `.cairn/cairn.db` (empty), wires Cursor (`.cursor/mcp.json`), and wires Pi + Claude Code (`.mcp.json`). The shared `.mcp.json` stores an absolute `CAIRN_HOME`. It does not use Cursor-only `${workspaceFolder}`. `--demo` seeds only an empty store and refuses to overwrite existing facts.

On an ephemeral VM, run the scoped help command once before starting an agent so the MCP process does not pay the package download during client startup. Run project init again for each new workspace, then reload the client's MCP configuration. Claude Code may ask for the expected project-server approval; Pi must be installed in the VM.

Global install without a project file:

```bash
npx --yes @quarkos/cairn init
```

## Commands

| Command | Purpose |
| --- | --- |
| `cairn init --project` | Empty database + Cursor + Pi/Claude MCP config in the current repo |
| `cairn init --project --demo` | Seed sample beliefs only when the project store is empty |
| `cairn dev` | Desk and API on port 4721, using this project's `.cairn` |
| `cairn start` | Production server after `npm run build` |
| `cairn mcp` | Stdio MCP server for agents |
| `cairn recall` | Print live beliefs as JSON |

Invoke via `npx --yes @quarkos/cairn …`, `npx --yes github:QuarkOS/Cairn …`, or `node bin/cairn.mjs` from a clone. `init` writes MCP `npx` args from that install source (`@quarkos/cairn`, `github:QuarkOS/Cairn`, or the local checkout path). Override with `CAIRN_NPX_SPEC` when MCP should use a different package.

## Agent contract

Send JSON to `POST /api/cairn` or call MCP tools `cairn_recall` and `cairn_request`.

Every write carries an `idempotencyKey`. Replay the same key and body after a crash and Cairn returns the original result without writing twice.

Recall returns `freshness` and `assurance` on each belief. Branch on `response.kind`. Rejections include `error.remedy.kind`.

### Example assert

```bash
curl -s http://127.0.0.1:4721/api/cairn \
  -H 'content-type: application/json' \
  -d '{
    "kind": "assert",
    "idempotencyKey": "s-021-deploy",
    "onConflict": "supersede",
    "draft": {
      "entity": "repo:acme/checkout",
      "attribute": "deploy.command",
      "value": { "kind": "text", "text": "bin/ship --env staging" },
      "provenance": {
        "kind": "observed",
        "command": "cat Makefile && bin/ship --help",
        "session": "s-021"
      },
      "validity": { "kind": "until-superseded" }
    }
  }'
```

## Harness plugins

### Cursor

After `init --project`, `.cursor/mcp.json` includes a `cairn` server. Cursor may use `${workspaceFolder}` here:

```json
{
  "mcpServers": {
    "cairn": {
      "command": "npx",
      "args": ["-y", "@quarkos/cairn", "mcp"],
      "env": {
        "CAIRN_HOME": "${workspaceFolder}/.cairn"
      }
    }
  }
}
```

Reload MCP in Cursor (or restart) so the tools appear. After `npx --yes github:QuarkOS/Cairn init --project`, the `args` entry is `github:QuarkOS/Cairn` instead of `@quarkos/cairn`.

### Claude Code

The same init writes project-scoped `.mcp.json`. Claude Code reads that file at session start and prompts once to approve project servers.

```json
{
  "mcpServers": {
    "cairn": {
      "command": "npx",
      "args": ["-y", "@quarkos/cairn", "mcp"],
      "env": {
        "CAIRN_HOME": "/absolute/path/to/your/project/.cairn"
      }
    }
  }
}
```

`CAIRN_HOME` is an absolute path written at init time. Claude Code does not understand Cursor's `${workspaceFolder}`. The `args` package matches whatever install source ran `init`.

You can also add the server with:

```bash
claude mcp add --scope project cairn -- npx -y @quarkos/cairn mcp
```

Then set `CAIRN_HOME` in the generated entry to your project's `.cairn` directory.

### Pi

Pi also reads `.mcp.json`. Init writes the same portable file used for Claude Code: absolute `CAIRN_HOME`, no `${workspaceFolder}`.

Start Pi from the project root (or any client that loads `.mcp.json`) and open `/mcp` to confirm the `cairn` server is listed.

## Desk and canvas

Open **Desk** (`/`) for the beliefs table and Agent API console. Open **Canvas** (`/canvas`) to see each agent or session as a draggable container with the facts they contributed.

Agents group by `provenance.by` for told facts and by `provenance.session` for observed or inferred facts. Drag pods to arrange the board; layout persists in `.cairn/canvas.json`.

## Publish

```bash
npm publish --access public
```

The published tarball ships the desk, canvas, API, CLI, and MCP server. Package and MCP server versions are both `0.4.2`.

## Where the database lives

`CAIRN_HOME` is the one directory that holds `cairn.db` and `canvas.json`.

Resolution, in order:

1. `CAIRN_HOME` if you set it
2. `./.cairn` in the directory you ran the command from, if that folder exists
3. `~/.cairn`

`cairn dev` and `cairn start` run Next.js from the installed package, not from your project. They still pin `CAIRN_HOME` using the rule above, so a throwaway project that ran `init --project` talks to **that** project's database without exporting anything. Set `CAIRN_HOME` only when you want a different store.

`CAIRN_DB_PATH` overrides just the SQLite file.

## Development

```bash
npm install
npm test
npm run dev
```

Database path resolves as described in [Where the database lives](#where-the-database-lives). `npm run dev` from a clone uses the same rule with the repo as cwd.

## Release trailer (Remotion)

A ~30s product trailer for X lives in `cairn-trailer/`. Preview with `npm run dev` inside that folder, or render:

```bash
cd cairn-trailer
npx remotion render CairnTrailer out/cairn-v0.4-trailer.mp4
```

## What Cairn refuses

Free-form JSON values. Semantic search. Editing facts in place. Waiting on a human mid-request.
