# Cursor Agent Plugin

## Sub-features

- Root `plugin.json` (Agent Plugins 1.0.0, name `cairn`, version `0.4.5`)
- Root `mcp.json`: stdio server `cairn` via `npx -y @quarkos/cairn mcp` with `env.CAIRN_HOME` = `${CAIRN_HOME}`
- Cursor overlay `.cursor-plugin/plugin.json` only so marketplace **Configure** can collect optional `CAIRN_HOME`. No rules, hooks, agents, or commands.
- Skills `skills/cairn-recall/SKILL.md` and `skills/cairn-assert/SKILL.md` (do not invent facts; unique `idempotencyKey`; `onConflict: supersede` for live facts)
- Honest limit: helps Cursor **IDE** users on the **installer's machine**. Does not inject into Cursor cloud agent VMs. Those remotes cannot see the installer's SQLite.

## How to get to it (user POV)

1. In the project that should hold beliefs, run `npx -y @quarkos/cairn init --project` (creates `.cairn/` on **your** machine).
2. Install this plugin in Cursor (Customize, or a local copy under `~/.cursor/plugins/local`). Reload so the `cairn` MCP server and the two skills appear.
3. Optionally **Plugins → Configure** and set `CAIRN_HOME` to the absolute path of that project's `.cairn`. Leave unset for native resolution.
4. Call `cairn_recall` at session start; `cairn_assert` after something actually lands; `cairn_retract` when a live fact is no longer true.

The npm package is always **`@quarkos/cairn`**. Never the unscoped `cairn` package.

## Driving it with shell

Does **not** need `launch.sh`. Cloud VMs cannot prove IDE injection. Prove the source layout and that nothing pins a coordinator path:

```bash
../scripts/drive-cursor-plugin.sh
```

Checks, from the repo root:

- `plugin.json`, `mcp.json`, `.cursor-plugin/plugin.json` exist
- `skills/cairn-recall/SKILL.md` and `skills/cairn-assert/SKILL.md` exist
- `mcp.json` command is `npx -y @quarkos/cairn mcp` (never unscoped `cairn`)
- no `/home/box/cairn-loop/.cairn` (or other coordinator pin) in plugin manifests
- overlay documents optional `CAIRN_HOME`

Do not treat `npx -y @quarkos/cairn mcp` against **published** 0.4.5 as proof of this PR's empty-string / `${CAIRN_HOME}` guard. That guard is in this checkout until a later npm release.

## Gotchas

- IDE on the installer machine only. Cursor cloud agents do not receive this plugin and cannot see coordinator SQLite.
- Never pin `/home/box/cairn-loop/.cairn` (or any other coordinator/cloud-agent path) in `mcp.json` or overlay defaults.
- `mcp.json` omits `cwd` on purpose. Do not set `cwd` to `${PLUGIN_ROOT}` — that would look for `./.cairn` inside the plugin install directory.
- Published `@quarkos/cairn@0.4.5` lacks the overlay that treats `""` and literal `${CAIRN_HOME}` as unset. This branch has it in `src/lib/cairn/paths.ts`; npm will pick it up only after a later publish.
- Marketplace submit and npm publish are out of scope for verification.
- Local Cursor load via `~/.cursor/plugins/local` is a coordinator/IDE step, not something a cloud verify instance can do.
