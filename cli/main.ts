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

function usage(): never {
  process.stderr.write(`Usage: cairn <command> [options]

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
  process.exit(1);
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

async function cmdInit(args: string[]): Promise<void> {
  const project = args.includes("--project");
  const demo = args.includes("--demo");
  const cwd = process.cwd();
  const home = project
    ? resolve(cwd, ".cairn")
    : resolve(process.env.CAIRN_HOME?.trim() || join(homedir(), ".cairn"));

  ensureDir(home);
  process.env.CAIRN_HOME = home;
  process.env.CAIRN_DB_PATH = join(home, "cairn.db");

  if (demo) {
    const { resetStore } = await import("../src/lib/cairn/store");
    await resetStore();
  } else {
    const { handleRequest } = await import("../src/lib/cairn/store");
    await handleRequest({ kind: "recall", query: { kind: "all" } });
  }

  const demoNote = demo
    ? `Loaded sample beliefs into ${home}\n`
    : `Empty store at ${home} (pass --demo for sample beliefs)\n`;

  if (project) {
    mergeMcpServer(join(cwd, ".cursor", "mcp.json"), cursorMcpConfig(cwd));
    mergeMcpServer(join(cwd, ".mcp.json"), portableMcpConfig(home));
    process.stdout.write(
      `Initialized project Cairn at ${home}\n` +
        demoNote +
        `Wrote .cursor/mcp.json (Cursor) and .mcp.json (Pi + Claude Code)\n`,
    );
  } else {
    const globalMcp = join(homedir(), ".config", "mcp", "mcp.json");
    mergeMcpServer(globalMcp, portableMcpConfig(home));
    process.stdout.write(
      `Initialized global Cairn at ${home}\n` +
        demoNote +
        `Wrote ${globalMcp}\n`,
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
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CAIRN_HOME: paths.home,
  };
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
  const { startMcpServer } = await import("../src/mcp/server");
  await startMcpServer();
}

async function cmdRecall(): Promise<void> {
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
