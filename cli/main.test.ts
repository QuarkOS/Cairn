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
