#!/usr/bin/env node
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  cpSync,
  realpathSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { npxInstallSpec } from "./npx-install-spec";
import { deskNextEnv } from "./desk-env";

import { resolveDeskHome } from "../src/lib/cairn/paths";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));

type McpServerConfig = {
  command: string;
  args: string[];
  env: Record<string, string>;
};

type PackageJson = {
  dependencies?: Record<string, string>;
};

function usage(stream: NodeJS.WriteStream = process.stdout): void {
  stream.write(`Usage: cairn <command> [options]

Commands:
  init [--project] [--demo]   Create Cairn home + MCP configs
  dev                Start the desk (next dev) on port 4721
  start              Start production server (next start)
  mcp                Run the stdio MCP server
  recall             Print live beliefs as JSON
  help               Show this help

  CAIRN_HOME is the store directory (cairn.db + canvas.json).
  dev/start set it from the directory you ran the command in
  unless it is already set. init --demo loads sample beliefs.

Package: @quarkos/cairn
`);
}

function npxPackageArgs(): string[] {
  return ["-y", npxInstallSpec(root)];
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function writeJson(path: string, value: unknown): void {
  ensureDir(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

type PreparedMcpConfig = {
  path: string;
  value: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readMcpConfig(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    throw new Error(`Refusing to overwrite invalid JSON in ${path}`);
  }
  if (!isRecord(parsed)) {
    throw new Error(`Refusing to overwrite non-object MCP config in ${path}`);
  }
  if ("mcpServers" in parsed && !isRecord(parsed.mcpServers)) {
    throw new Error(`mcpServers must be an object in ${path}`);
  }
  return parsed;
}

function prepareMcpServer(
  path: string,
  server: McpServerConfig,
): PreparedMcpConfig {
  const existing = readMcpConfig(path);
  return {
    path,
    value: {
      ...existing,
      mcpServers: {
        ...(isRecord(existing.mcpServers) ? existing.mcpServers : {}),
        cairn: server,
      },
    },
  };
}

function cursorMcpConfig(_projectRoot: string): McpServerConfig {
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

function parseInitArgs(args: string[]): { project: boolean; demo: boolean } {
  let project = false;
  let demo = false;
  for (const arg of args) {
    if (arg === "--project") {
      project = true;
    } else if (arg === "--demo") {
      demo = true;
    } else {
      throw new Error(`Unknown init option: ${arg}`);
    }
  }
  return { project, demo };
}

async function cmdInit(args: string[]): Promise<void> {
  const { project, demo } = parseInitArgs(args);
  const cwd = process.cwd();
  const home = project
    ? resolve(cwd, ".cairn")
    : resolve(process.env.CAIRN_HOME?.trim() || join(homedir(), ".cairn"));

  const preparedConfigs: PreparedMcpConfig[] = project
    ? [
        prepareMcpServer(join(cwd, ".cursor", "mcp.json"), cursorMcpConfig(cwd)),
        prepareMcpServer(join(cwd, ".mcp.json"), portableMcpConfig(home)),
      ]
    : [
        prepareMcpServer(
          join(homedir(), ".config", "mcp", "mcp.json"),
          portableMcpConfig(home),
        ),
      ];

  ensureDir(home);
  process.env.CAIRN_HOME = home;
  process.env.CAIRN_DB_PATH = join(home, "cairn.db");

  let liveBeliefCount = 0;
  if (demo) {
    const { seedDbIfEmpty } = await import("../src/lib/cairn/persistence");
    seedDbIfEmpty(join(home, "cairn.db"), Date.now());
  }
  {
    const { handleRequest } = await import("../src/lib/cairn/store");
    const response = await handleRequest({
      kind: "recall",
      query: { kind: "all" },
    });
    if (response.kind === "recalled") liveBeliefCount = response.beliefs.length;
  }

  const demoNote = demo
    ? `Loaded sample beliefs into ${home} (${liveBeliefCount} live beliefs)\n`
    : `Store ready at ${home} (${liveBeliefCount} live beliefs)\n`;

  for (const prepared of preparedConfigs) {
    writeJson(prepared.path, prepared.value);
  }

  if (project) {
    process.stdout.write(
      `Initialized project Cairn at ${home}\n` +
        demoNote +
        `Wrote .cursor/mcp.json (Cursor) and .mcp.json (Pi + Claude Code)\n`,
    );
  } else {
    const globalMcp = preparedConfigs[0]?.path;
    process.stdout.write(
      `Initialized global Cairn at ${home}\n` +
        demoNote +
        `Wrote ${globalMcp ?? "global MCP config"}\n`,
    );
  }
}

/**
 * Turbopack pins its workspace to this package (see next.config.ts). When npm
 * hoists next/react/react-dom to a parent node_modules, resolution fails and
 * /api/cairn 500s. Materialize those packages inside the package tree once.
 */
function deskRuntimeIsHermetic(): boolean {
  try {
    const rootReal = realpathSync(root);
    for (const name of ["next", "react", "react-dom"] as const) {
      const pkgJson = join(root, "node_modules", name, "package.json");
      if (!existsSync(pkgJson)) return false;
      const resolved = realpathSync(dirname(pkgJson));
      if (!resolved.startsWith(rootReal + "/") && resolved !== rootReal) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

function ensureDeskRuntime(): void {
  if (deskRuntimeIsHermetic()) return;

  const pkg = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  ) as PackageJson;
  const deps = pkg.dependencies ?? {};
  if (!deps.next || !deps.react || !deps["react-dom"]) {
    throw new Error(
      "Package is missing next/react/react-dom dependency versions",
    );
  }

  const staging = join(root, ".cairn-desk-staging");
  rmSync(staging, { recursive: true, force: true });
  ensureDir(staging);
  // Install the full production tree so Turbopack's pinned package root can
  // resolve better-sqlite3 and the rest without walking to a parent hoist.
  writeJson(join(staging, "package.json"), {
    name: "@quarkos/cairn-desk-runtime",
    version: "0.0.0",
    private: true,
    dependencies: deps,
  });

  process.stderr.write(
    "Cairn: preparing a local Next.js runtime for the desk (one-time)…\n",
  );
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(
    npm,
    ["install", "--omit=dev", "--no-fund", "--no-audit"],
    {
      cwd: staging,
      stdio: "inherit",
      env: process.env,
    },
  );
  if (result.status !== 0) {
    rmSync(staging, { recursive: true, force: true });
    throw new Error("Failed to install the local Next.js desk runtime");
  }

  const destNm = join(root, "node_modules");
  ensureDir(destNm);
  const stagingNm = join(staging, "node_modules");
  for (const name of readdirSync(stagingNm)) {
    if (name.startsWith(".")) continue;
    const from = join(stagingNm, name);
    const to = join(destNm, name);
    rmSync(to, { recursive: true, force: true });
    cpSync(from, to, { recursive: true });
  }

  rmSync(staging, { recursive: true, force: true });
  writeFileSync(join(destNm, ".cairn-desk-hermetic"), `${Date.now()}\n`);

  if (!deskRuntimeIsHermetic()) {
    throw new Error("Desk runtime install finished but modules are still missing");
  }
}

function runNext(script: "dev" | "start", extraArgs: string[]): void {
  ensureDeskRuntime();
  const paths = resolveDeskHome({
    cwd: process.cwd(),
    packageRoot: root,
    env: process.env,
  });
  const env = deskNextEnv(script, process.env);
  env.CAIRN_HOME = paths.home;
  if (!process.env.CAIRN_DB_PATH?.trim()) {
    env.CAIRN_DB_PATH = paths.dbPath;
  }
  process.stderr.write(`Cairn desk: CAIRN_HOME=${paths.home}\n`);

  const nextBin = require.resolve("next/dist/bin/next", {
    paths: [root],
  });
  const child = spawn(
    process.execPath,
    [nextBin, script, "--hostname", "0.0.0.0", ...extraArgs],
    {
      cwd: root,
      stdio: "inherit",
      env,
    },
  );
  child.on("exit", (code) => process.exit(code ?? 0));
}

function parsePortArgs(args: string[]): string {
  if (args.length === 0) return "4721";
  if (args.length !== 2 || args[0] !== "--port") {
    throw new Error("Only --port <1-65535> is supported for this command");
  }
  const port = Number(args[1]);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("Port must be an integer between 1 and 65535");
  }
  return String(port);
}

function cmdDev(args: string[]): void {
  runNext("dev", ["--port", parsePortArgs(args)]);
}

function cmdStart(args: string[]): void {
  runNext("start", ["--port", parsePortArgs(args)]);
}

async function cmdMcp(args: string[]): Promise<void> {
  if (args.length > 0) throw new Error("mcp does not accept options");
  const { startMcpServer } = await import("../src/mcp/server");
  await startMcpServer();
}

async function cmdRecall(args: string[]): Promise<void> {
  if (args.length > 0) throw new Error("recall does not accept options");
  const { handleRequest } = await import("../src/lib/cairn/store");
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
      usage(process.stderr);
      process.exitCode = 1;
      break;
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
      await cmdMcp(args);
      break;
    case "recall":
      await cmdRecall(args);
      break;
    default:
      process.stderr.write(`Unknown command: ${command}\n`);
      usage(process.stderr);
      process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`cairn: ${message}\n`);
  process.exit(1);
});
