# CLI init + recall

## Sub-features

- `node bin/cairn.mjs init --project` — create `.cairn/`, seed DB, write MCP configs
- `node bin/cairn.mjs recall` — print live beliefs JSON to stdout
- `CAIRN_HOME` / `CAIRN_DB_PATH` env overrides

## How to get to it (user POV)

From a project directory:

```bash
npx --yes @quarkos/cairn init --project
npx --yes @quarkos/cairn recall
```

For verification, point env at the scratch home from `instance.json` instead of `./.cairn`.

## Driving it with shell

After `launch.sh`:

```bash
CAIRN_HOME=$(node -e "console.log(JSON.parse(require('fs').readFileSync('.cursor/skills/verify-cairn/scratch/instance.json','utf8')).cairnHome)")
CAIRN_DB_PATH=$(node -e "console.log(JSON.parse(require('fs').readFileSync('.cursor/skills/verify-cairn/scratch/instance.json','utf8')).dbPath)")
node bin/cairn.mjs recall | node -e "const b=JSON.parse(require('fs').readFileSync(0,'utf8')); if(b.kind!=='recalled') process.exit(1); console.log('beliefs:', b.beliefs.length)"
```

Exit code 0 and a positive belief count proves CLI reads the same store as the API.

## Gotchas

- `init` without `--project` writes to `~/.cairn` and ignores project cwd — use `--project` or set `CAIRN_HOME` before `init --project`.
- `recall` does not start the desk; it reads SQLite directly.
- Do not use bare `npx cairn` (that is an unrelated npm package). Prefer `npx --yes @quarkos/cairn` or in-repo `node bin/cairn.mjs`.
