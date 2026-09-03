# CLI init + recall

## Sub-features

- `node bin/cairn.mjs init --project` — create `<cwd>/.cairn/`, empty DB, write MCP configs. Always that path; **ignores** `CAIRN_HOME`.
- `node bin/cairn.mjs init --project --demo` — same, plus sample beliefs, but only when the store is empty. Refuses (exits non-zero, leaves existing facts) if the store already has facts, retractions, or stamps.
- `node bin/cairn.mjs recall` — print live beliefs JSON to stdout
- `CAIRN_HOME` / `CAIRN_DB_PATH` env overrides for **recall**, **dev**, and **start** (not for `init --project`). `dev`/`start` pin `CAIRN_HOME` from the directory you invoked the command in.
- This PR's overlay: empty string and the literal `${CAIRN_HOME}` are treated as unset, so recall/dev/start/MCP fall through to native resolution (`CAIRN_HOME` if usable, else `./.cairn` if present, else `~/.cairn`).

## How to get to it (user POV)

From a project directory:

```bash
npx --yes @quarkos/cairn init --project
npx --yes @quarkos/cairn recall
```

`init --project` always writes `<cwd>/.cairn` even if `CAIRN_HOME` is set. For verification **recall**, point env at the scratch home from `instance.json` instead of relying on cwd.

## Driving it with shell

**Init (no desk).** Does not need `launch.sh`:

```bash
../scripts/drive-cli-init.sh
```

Proves `init --project` ignores `CAIRN_HOME`, `--demo` refuses a non-empty store, and recall treats `CAIRN_HOME=""` / `CAIRN_HOME='${CAIRN_HOME}'` as unset against `./.cairn`.

**Recall against a verify instance** (after `launch.sh` + `doctor.sh`):

```bash
CAIRN_HOME=$(node -e "console.log(JSON.parse(require('fs').readFileSync('.cursor/skills/verify-cairn/scratch/instance.json','utf8')).cairnHome)")
CAIRN_DB_PATH=$(node -e "console.log(JSON.parse(require('fs').readFileSync('.cursor/skills/verify-cairn/scratch/instance.json','utf8')).dbPath)")
node bin/cairn.mjs recall | node -e "const b=JSON.parse(require('fs').readFileSync(0,'utf8')); if(b.kind!=='recalled') process.exit(1); console.log('beliefs:', b.beliefs.length)"
```

Or `../scripts/drive-cli-recall.sh`. Exit code 0 and a positive belief count proves CLI reads the same store as the API.

## Gotchas

- `init --project` always uses `<cwd>/.cairn` and **ignores** `CAIRN_HOME`. Do not set `CAIRN_HOME` expecting init to follow it.
- `init` without `--project` writes to `~/.cairn`, or to `CAIRN_HOME` when that env is a usable path.
- `--demo` seeds only an empty store. Re-running `init --project --demo` on an existing store throws `Refusing --demo because the Cairn store is not empty; existing data was preserved`.
- Empty `CAIRN_HOME` and the unsubstituted literal `${CAIRN_HOME}` are treated as unset **in this checkout** (`resolveCairnPaths`). Published npm `@quarkos/cairn@0.4.5` does not include that guard until a later release.
- `recall` does not start the desk; it reads SQLite directly.
- Do not use bare `npx cairn` (that is an unrelated npm package). Prefer `npx --yes @quarkos/cairn` or in-repo `node bin/cairn.mjs`.
