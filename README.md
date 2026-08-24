# Cairn

Cairn is an append-only store of typed facts. An agent asserts a fact in one session and recalls it, with a freshness verdict, at the start of the next.

Facts persist in SQLite. The desk is optional. The work happens on JSON and MCP.

The npm package is **`@quarkos/cairn`**. Never run bare `npx cairn` — that resolves Adam Terlson's unrelated 2017 React Native styling package (`cairn@0.8.0`).

## Install

From any empty project folder (Node 20+):

```bash
npx --yes @quarkos/cairn init --project
npx --yes @quarkos/cairn dev
```

`init --project` creates `.cairn/cairn.db`, wires Cursor (`.cursor/mcp.json`), and wires Pi + Claude Code (`.mcp.json`). The shared `.mcp.json` stores an absolute `CAIRN_HOME`. It does not use Cursor-only `${workspaceFolder}`.

Global install without a project file:

```bash
npx --yes @quarkos/cairn init
```

## Commands

| Command | Purpose |
| --- | --- |
| `cairn init --project` | Database + Cursor + Pi/Claude MCP config in the current repo |
| `cairn dev` | Desk and API on port 4721 |
| `cairn start` | Production server after `npm run build` |
| `cairn mcp` | Stdio MCP server for agents |
| `cairn recall` | Print live beliefs as JSON |

Invoke via `npx --yes @quarkos/cairn …`, or `node bin/cairn.mjs` from a clone. Override the MCP install specifier with `CAIRN_NPX_SPEC` (for example `github:QuarkOS/Cairn`) when you need a non-registry install.

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

Reload MCP in Cursor (or restart) so the tools appear.

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

`CAIRN_HOME` is an absolute path written at init time. Claude Code does not understand Cursor's `${workspaceFolder}`.

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

The published tarball ships the desk, canvas, API, CLI, and MCP server. Package and MCP server versions are both `0.4.1`.

## Development

```bash
npm install
npm test
npm run dev
```

Database path resolves to `./.cairn/cairn.db` when that directory exists, otherwise `~/.cairn/cairn.db`. Override with `CAIRN_HOME` or `CAIRN_DB_PATH`.

## Release trailer (Remotion)

A ~30s product trailer for X lives in `cairn-trailer/`. Preview with `npm run dev` inside that folder, or render:

```bash
cd cairn-trailer
npx remotion render CairnTrailer out/cairn-v0.4-trailer.mp4
```

## What Cairn refuses

Free-form JSON values. Semantic search. Editing facts in place. Waiting on a human mid-request.
