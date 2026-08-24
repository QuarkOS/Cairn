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

function runCli(cwd: string, args: string[]): Promise<CliResult> {
  return new Promise((resolveResult, reject) => {
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.CAIRN_HOME;
    delete env.CAIRN_DB_PATH;
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
    assert.deepEqual(result, {
      clearedLock: false,
      clearedTurbopackCache: false,
    });
  });

  it("clears a stale lock and turbopack cache after a dead desk PID", () => {
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
    writeFileSync(join(cacheDir, "LOG"), "keep-me-gone");

    const result = prepareNextDevState(root);
    assert.equal(result.clearedLock, true);
    assert.equal(result.clearedTurbopackCache, true);
    assert.equal(result.reason, "stale-lock");
    assert.equal(existsSync(join(root, ".next", "dev", "lock")), false);
    assert.equal(existsSync(join(cacheDir, "CURRENT")), false);
    assert.equal(existsSync(join(cacheDir, "LOG")), false);
    assert.equal(existsSync(join(root, ".next", "dev", "cache")), true);
  });

  it("clears a corrupt CURRENT even without a lock file", () => {
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
    writeFileSync(join(cacheDir, "CURRENT"), "");

    const result = prepareNextDevState(root);
    assert.equal(result.clearedLock, false);
    assert.equal(result.clearedTurbopackCache, true);
    assert.equal(result.reason, "corrupt-cache");
    assert.equal(existsSync(join(cacheDir, "CURRENT")), false);
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
    assert.deepEqual(result, {
      clearedLock: false,
      clearedTurbopackCache: false,
    });
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
