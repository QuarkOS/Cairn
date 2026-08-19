# Cairn

Cairn is an append-only store of typed facts. An agent asserts a fact in one session and recalls it, with a freshness verdict, at the start of the next.

Facts persist in SQLite. The desk is optional. The work happens on JSON and MCP.

## Install

```bash
npx cairn init --project
npx cairn dev
```

`init --project` creates `.cairn/cairn.db`, wires Cursor (`.cursor/mcp.json`), and wires Pi (`.mcp.json`).

Global install without a project file:

```bash
npx cairn init
```

## Commands

| Command | Purpose |
| --- | --- |
| `cairn init --project` | Database + Cursor + Pi MCP config in the current repo |
| `cairn dev` | Desk and API on port 4721 |
| `cairn start` | Production server after `npm run build` |
| `cairn mcp` | Stdio MCP server for agents |
| `cairn recall` | Print live beliefs as JSON |

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

**Cursor.** After `cairn init --project`, `.cursor/mcp.json` includes a `cairn` server that runs `npx cairn mcp`.

**Pi.** The same init writes `.mcp.json` for Pi and other MCP clients. Pi reads `.mcp.json` and host imports such as `cursor`.

## Desk and canvas

Open **Desk** (`/`) for the beliefs table and Agent API console. Open **Canvas** (`/canvas`) to see each agent or session as a draggable container with the facts they contributed.

Agents group by `provenance.by` for told facts and by `provenance.session` for observed or inferred facts. Drag pods to arrange the board; layout persists in `.cairn/canvas.json`.

## Publish and install from npm

```bash
npm publish
npx cairn init --project
npx cairn dev
```

The published tarball ships the full desk, canvas, API, CLI, and MCP server. Requires Node 20+.

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

See `cairn-trailer/x-post-draft.md` for suggested post copy.

## What Cairn refuses

Free-form JSON values. Semantic search. Editing facts in place. Waiting on a human mid-request.
