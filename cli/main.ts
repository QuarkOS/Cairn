#!/usr/bin/env node
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { homedir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));

type McpServerConfig = {
  command: string;
  args: string[];
  env: Record<string, string>;
};

function usage(): never {
  process.stderr.write(`Usage: cairn <command> [options]

Commands:
  init [--project]   Create Cairn home + MCP configs
  dev                Start the desk (next dev) on port 4721
  start              Start production server (next start)
  mcp                Run the stdio MCP server
  recall             Print live beliefs as JSON
  help               Show this help

Package: @quarkos/cairn
`);
  process.exit(1);
}

/**
 * Specifier passed to `npx` in generated MCP configs.
 * Prefer the scoped npm name once it resolves; otherwise GitHub so
 * init works before the first `npm publish`.
 */
function npxInstallSpec(): string {
  return process.env.CAIRN_NPX_SPEC?.trim() || "github:QuarkOS/Cairn";
}

function npxPackageArgs(): string[] {
  return ["-y", npxInstallSpec()];
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function writeJson(path: string, value: unknown): void {
  ensureDir(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function mergeMcpServer(
  path: string,
  server: McpServerConfig,
): void {
  let existing: { mcpServers?: Record<string, unknown> } = {};
  if (existsSync(path)) {
    try {
      existing = JSON.parse(readFileSync(path, "utf8")) as typeof existing;
    } catch {
      existing = {};
    }
  }
  const mcpServers = {
    ...(existing.mcpServers ?? {}),
    cairn: server,
  };
  writeJson(path, { ...existing, mcpServers });
}

function cursorMcpConfig(projectRoot: string): McpServerConfig {
  return {
    command: "npx",
    args: [...npxPackageArgs(), "mcp"],
    env: {
      CAIRN_HOME: "${workspaceFolder}/.cairn",
    },
  };
}

/** Pi and Claude Code do not expand Cursor's ${workspaceFolder}. Bake an absolute path. */
function portableMcpConfig(cairnHome: string): McpServerConfig {
  return {
    command: "npx",
    args: [...npxPackageArgs(), "mcp"],
    env: {
      CAIRN_HOME: cairnHome,
    },
  };
}

async function cmdInit(args: string[]): Promise<void> {
  const project = args.includes("--project");
  const cwd = process.cwd();
  const home = project
    ? resolve(cwd, ".cairn")
    : resolve(process.env.CAIRN_HOME?.trim() || join(homedir(), ".cairn"));

  ensureDir(home);
  process.env.CAIRN_HOME = home;
  if (!process.env.CAIRN_DB_PATH) {
    process.env.CAIRN_DB_PATH = join(home, "cairn.db");
  }

  // Seed the DB by loading the store once.
  const { handleRequest } = await import("../src/lib/cairn/store.ts");
  await handleRequest({ kind: "recall", query: { kind: "all" } });

  if (project) {
    mergeMcpServer(join(cwd, ".cursor", "mcp.json"), cursorMcpConfig(cwd));
    // Shared project MCP file for Pi and Claude Code (absolute CAIRN_HOME).
    mergeMcpServer(join(cwd, ".mcp.json"), portableMcpConfig(home));
    process.stdout.write(
      `Initialized project Cairn at ${home}\n` +
        `Wrote .cursor/mcp.json (Cursor) and .mcp.json (Pi + Claude Code)\n`,
    );
  } else {
    const globalMcp = join(homedir(), ".config", "mcp", "mcp.json");
    mergeMcpServer(globalMcp, portableMcpConfig(home));
    process.stdout.write(
      `Initialized global Cairn at ${home}\n` +
        `Wrote ${globalMcp}\n`,
    );
  }
}

function runNext(script: "dev" | "start", extraArgs: string[]): void {
  const nextBin = require.resolve("next/dist/bin/next");
  const child = spawn(
    process.execPath,
    [nextBin, script, "--hostname", "0.0.0.0", ...extraArgs],
    {
      cwd: root,
      stdio: "inherit",
      env: process.env,
    },
  );
  child.on("exit", (code) => process.exit(code ?? 0));
}

function cmdDev(args: string[]): void {
  const port = args.includes("--port")
    ? args[args.indexOf("--port") + 1]
    : "4721";
  runNext("dev", ["--port", port ?? "4721"]);
}

function cmdStart(args: string[]): void {
  const port = args.includes("--port")
    ? args[args.indexOf("--port") + 1]
    : "4721";
  runNext("start", ["--port", port ?? "4721"]);
}

async function cmdMcp(): Promise<void> {
  const { startMcpServer } = await import("../src/mcp/server.ts");
  await startMcpServer();
}

async function cmdRecall(): Promise<void> {
  const { handleRequest } = await import("../src/lib/cairn/store.ts");
  const response = await handleRequest({
    kind: "recall",
    query: { kind: "all" },
  });
  process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case undefined:
    case "help":
    case "--help":
    case "-h":
      usage();
      break;
    case "init":
      await cmdInit(args);
      break;
    case "dev":
      cmdDev(args);
      break;
    case "start":
      cmdStart(args);
      break;
    case "mcp":
      await cmdMcp();
      break;
    case "recall":
      await cmdRecall();
      break;
    default:
      process.stderr.write(`Unknown command: ${command}\n`);
      usage();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`cairn: ${message}\n`);
  process.exit(1);
});
