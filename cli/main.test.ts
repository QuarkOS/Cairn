import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";

import { asAttributeId, asEntityId, asSessionId } from "../src/lib/cairn/brand";
import { handleRequest } from "../src/lib/cairn/store";
import { deskNextEnv } from "./desk-env";
import { prepareNextDevState } from "./prepare-dev-state";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const binPath = join(repoRoot, "bin", "cairn.mjs");

type CliResult = { code: number | null; stdout: string; stderr: string };

function runCli(
  cwd: string,
  args: string[],
  extraEnv: NodeJS.ProcessEnv = {},
): Promise<CliResult> {
  return new Promise((resolveResult, reject) => {
    const env: NodeJS.ProcessEnv = { ...process.env, ...extraEnv };
    if (!("CAIRN_HOME" in extraEnv)) delete env.CAIRN_HOME;
    if (!("CAIRN_DB_PATH" in extraEnv)) delete env.CAIRN_DB_PATH;
    const child = spawn(process.execPath, [binPath, ...args], {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolveResult({ code, stdout, stderr }));
  });
}

describe("deskNextEnv", () => {
  it("forces Watchpack polling for next dev but not next start", () => {
    const base = { PATH: "/usr/bin", CHOKIDAR_INTERVAL: "250" };
    const dev = deskNextEnv("dev", base);
    assert.equal(dev.WATCHPACK_POLLING, "true");
    assert.equal(dev.CHOKIDAR_USEPOLLING, "true");
    assert.equal(dev.CHOKIDAR_INTERVAL, "250");
    assert.equal(dev.PATH, "/usr/bin");

    const start = deskNextEnv("start", base);
    assert.equal(start.WATCHPACK_POLLING, undefined);
    assert.equal(start.CHOKIDAR_USEPOLLING, undefined);
  });

  it("defaults CHOKIDAR_INTERVAL when unset for next dev", () => {
    const dev = deskNextEnv("dev", { PATH: "/usr/bin" });
    assert.equal(dev.CHOKIDAR_INTERVAL, "1000");
  });
});

describe("prepareNextDevState", () => {
  const roots: string[] = [];

  after(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  function fakePackageRoot(): string {
    const root = mkdtempSync(join(tmpdir(), "cairn-dev-state-"));
    roots.push(root);
    return root;
  }

  it("is a no-op when .next/dev is absent", () => {
    const root = fakePackageRoot();
    const result = prepareNextDevState(root);
    assert.deepEqual(result, { clearedDevDir: false });
  });

  it("removes the whole .next/dev tree after a dead desk PID", () => {
    const root = fakePackageRoot();
    const cacheDir = join(
      root,
      ".next",
      "dev",
      "cache",
      "turbopack",
      "v16.3.1-test",
    );
    const staticCss = join(
      root,
      ".next",
      "dev",
      "static",
      "chunks",
      "src_app_globals_css_torn._.single.css",
    );
    const postcssPool = join(
      root,
      ".next",
      "dev",
      "build",
      "chunks",
      "pool_entry-[turbopack-node]_transforms_postcss_ts_torn._.js",
    );
    mkdirSync(cacheDir, { recursive: true });
    mkdirSync(dirname(staticCss), { recursive: true });
    mkdirSync(dirname(postcssPool), { recursive: true });
    writeFileSync(
      join(root, ".next", "dev", "lock"),
      JSON.stringify({
        pid: 1_000_000_001,
        port: 4721,
        hostname: "localhost",
        appUrl: "http://localhost:4721",
        startedAt: 0,
      }),
    );
    writeFileSync(
      join(cacheDir, "CURRENT"),
      `${JSON.stringify({ max_sequence_number: 0, commit_time: "x" })}\n`,
    );
    writeFileSync(staticCss, "/* torn globals */\n@invalid");
    writeFileSync(postcssPool, 'throw new Error("torn postcss");\n');

    const result = prepareNextDevState(root);
    assert.equal(result.clearedDevDir, true);
    assert.equal(result.reason, "stale-lock");
    assert.equal(existsSync(join(root, ".next", "dev")), false);
    assert.equal(existsSync(staticCss), false);
    assert.equal(existsSync(postcssPool), false);
  });

  it("removes leftover .next/dev even when the lock file is already gone", () => {
    const root = fakePackageRoot();
    const staticCss = join(
      root,
      ".next",
      "dev",
      "static",
      "chunks",
      "src_app_globals_css_torn._.single.css",
    );
    mkdirSync(dirname(staticCss), { recursive: true });
    writeFileSync(staticCss, "/* torn */\n@invalid-css-{{{{");

    const result = prepareNextDevState(root);
    assert.equal(result.clearedDevDir, true);
    assert.equal(result.reason, "previous-dev");
    assert.equal(existsSync(join(root, ".next", "dev")), false);
  });

  it("leaves state alone when the lock PID is still alive", () => {
    const root = fakePackageRoot();
    const cacheDir = join(
      root,
      ".next",
      "dev",
      "cache",
      "turbopack",
      "v16.3.1-test",
    );
    mkdirSync(cacheDir, { recursive: true });
    const current = `${JSON.stringify({ max_sequence_number: 1 })}\n`;
    writeFileSync(join(cacheDir, "CURRENT"), current);
    writeFileSync(
      join(root, ".next", "dev", "lock"),
      JSON.stringify({
        pid: process.pid,
        port: 4721,
        hostname: "localhost",
        appUrl: "http://localhost:4721",
        startedAt: Date.now(),
      }),
    );

    const result = prepareNextDevState(root);
    assert.deepEqual(result, { clearedDevDir: false });
    assert.equal(readFileSync(join(cacheDir, "CURRENT"), "utf8"), current);
    assert.equal(existsSync(join(root, ".next", "dev", "lock")), true);
  });
});

describe("CLI safety", () => {
  const roots: string[] = [];

  after(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  it("prints help to stdout with a zero exit code", async () => {
    const root = mkdtempSync(join(tmpdir(), "cairn-cli-help-"));
    roots.push(root);
    const result = await runCli(root, ["--help"]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Usage: cairn/);
  });

  it("prints help for mcp --help and recall --help without starting a store", async () => {
    const root = mkdtempSync(join(tmpdir(), "cairn-cli-sub-help-"));
    roots.push(root);
    for (const command of ["mcp", "recall"] as const) {
      const result = await runCli(root, [command, "--help"]);
      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, /Usage: cairn/);
      assert.match(result.stdout, /mcp/);
      assert.equal(existsSync(join(root, ".cairn")), false);
    }
  });

  it("writes absolute CAIRN_HOME in .mcp.json, not Cursor's workspace placeholder", async () => {
    const root = mkdtempSync(join(tmpdir(), "cairn-cli-portable-mcp-"));
    roots.push(root);
    const result = await runCli(root, ["init", "--project"]);
    assert.equal(result.code, 0, result.stderr);

    const portable = JSON.parse(readFileSync(join(root, ".mcp.json"), "utf8")) as {
      mcpServers: { cairn: { env: { CAIRN_HOME: string } } };
    };
    const cursor = JSON.parse(
      readFileSync(join(root, ".cursor", "mcp.json"), "utf8"),
    ) as { mcpServers: { cairn: { env: { CAIRN_HOME: string } } } };

    const home = join(root, ".cairn");
    assert.equal(portable.mcpServers.cairn.env.CAIRN_HOME, home);
    assert.equal(portable.mcpServers.cairn.env.CAIRN_HOME.includes("${"), false);
    assert.equal(
      cursor.mcpServers.cairn.env.CAIRN_HOME,
      "${workspaceFolder}/.cairn",
    );
  });

  it("init --project ignores CAIRN_HOME and still uses ./.cairn", async () => {
    const decoy = mkdtempSync(join(tmpdir(), "cairn-cli-decoy-home-"));
    const root = mkdtempSync(join(tmpdir(), "cairn-cli-ignore-home-"));
    roots.push(decoy, root);
    const result = await runCli(root, ["init", "--project"], {
      CAIRN_HOME: decoy,
    });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(existsSync(join(root, ".cairn")), true);
    assert.equal(existsSync(join(decoy, "cairn.db")), false);
    const portable = JSON.parse(readFileSync(join(root, ".mcp.json"), "utf8")) as {
      mcpServers: { cairn: { env: { CAIRN_HOME: string } } };
    };
    assert.equal(portable.mcpServers.cairn.env.CAIRN_HOME, join(root, ".cairn"));
    assert.notEqual(portable.mcpServers.cairn.env.CAIRN_HOME, decoy);
  });

  it("rejects unknown init options before creating files", async () => {
    const root = mkdtempSync(join(tmpdir(), "cairn-cli-flags-"));
    roots.push(root);
    const result = await runCli(root, ["init", "--project", "--typo"]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Unknown init option: --typo/);
    assert.equal(existsSync(join(root, ".cairn")), false);
    assert.equal(existsSync(join(root, ".cursor")), false);
    assert.equal(existsSync(join(root, ".mcp.json")), false);
  });

  it("preserves malformed MCP config when init preflight fails", async () => {
    const root = mkdtempSync(join(tmpdir(), "cairn-cli-json-"));
    roots.push(root);
    const cursorDir = join(root, ".cursor");
    mkdirSync(cursorDir);
    const cursorPath = join(cursorDir, "mcp.json");
    const original = '{"mcpServers":';
    writeFileSync(cursorPath, original, "utf8");

    const result = await runCli(root, ["init", "--project"]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /invalid JSON/);
    assert.equal(readFileSync(cursorPath, "utf8"), original);
    assert.equal(existsSync(join(root, ".cairn")), false);
    assert.equal(existsSync(join(root, ".mcp.json")), false);
  });

  it("preserves existing facts and other MCP servers on demo re-init", async () => {
    const root = mkdtempSync(join(tmpdir(), "cairn-cli-demo-"));
    roots.push(root);
    const first = await runCli(root, ["init", "--project"]);
    assert.equal(first.code, 0, first.stderr);

    const cursorPath = join(root, ".cursor", "mcp.json");
    const portablePath = join(root, ".mcp.json");
    const cursor = JSON.parse(readFileSync(cursorPath, "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    const portable = JSON.parse(readFileSync(portablePath, "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    cursor.mcpServers.other = { command: "other", args: [], env: {} };
    portable.mcpServers.other = { command: "other", args: [], env: {} };
    writeFileSync(cursorPath, `${JSON.stringify(cursor)}\n`, "utf8");
    writeFileSync(portablePath, `${JSON.stringify(portable)}\n`, "utf8");

    const previousHome = process.env.CAIRN_HOME;
    const previousDbPath = process.env.CAIRN_DB_PATH;
    process.env.CAIRN_HOME = join(root, ".cairn");
    delete process.env.CAIRN_DB_PATH;
    await handleRequest({
      kind: "assert",
      idempotencyKey: "keep-me",
      onConflict: "fail",
      draft: {
        entity: asEntityId("cli:test"),
        attribute: asAttributeId("keep"),
        value: { kind: "text", text: "keep" },
        provenance: {
          kind: "told",
          by: "cli-test",
          session: asSessionId("cli"),
        },
        validity: { kind: "until-superseded" },
      },
    });
    if (previousHome === undefined) delete process.env.CAIRN_HOME;
    else process.env.CAIRN_HOME = previousHome;
    if (previousDbPath === undefined) delete process.env.CAIRN_DB_PATH;
    else process.env.CAIRN_DB_PATH = previousDbPath;

    const reinit = await runCli(root, ["init", "--project"]);
    assert.equal(reinit.code, 0, reinit.stderr);

    const demo = await runCli(root, ["init", "--project", "--demo"]);
    assert.equal(demo.code, 1);
    assert.match(demo.stderr, /not empty/);

    const afterHome = process.env.CAIRN_HOME;
    const afterDbPath = process.env.CAIRN_DB_PATH;
    process.env.CAIRN_HOME = join(root, ".cairn");
    delete process.env.CAIRN_DB_PATH;
    const recalled = await handleRequest({ kind: "recall", query: { kind: "all" } });
    if (afterHome === undefined) delete process.env.CAIRN_HOME;
    else process.env.CAIRN_HOME = afterHome;
    if (afterDbPath === undefined) delete process.env.CAIRN_DB_PATH;
    else process.env.CAIRN_DB_PATH = afterDbPath;

    assert.equal(recalled.kind, "recalled");
    if (recalled.kind !== "recalled") return;
    assert.equal(
      recalled.beliefs.some((belief) => belief.current.attribute === "keep"),
      true,
    );
    const cursorAfter = JSON.parse(readFileSync(cursorPath, "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    const portableAfter = JSON.parse(readFileSync(portablePath, "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    assert.ok(cursorAfter.mcpServers.other);
    assert.ok(portableAfter.mcpServers.other);
  });
});
