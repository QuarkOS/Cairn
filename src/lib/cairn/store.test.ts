import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";

import { asAttributeId, asEntityId } from "./brand";
import { handleRequest } from "./store";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const WORKER = `
  import { handleRequest } from "./src/lib/cairn/store.ts";

  const waitFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const mode = process.env.CAIRN_TEST_MODE;
  const delay = Number(process.env.CAIRN_TEST_DELAY ?? "0");
  const recall = () => handleRequest({ kind: "recall", query: { kind: "all" } });

  if (mode === "reader") {
    const before = await recall();
    await waitFor(delay);
    const after = await recall();
    process.stdout.write(JSON.stringify({
      before: before.kind === "recalled" ? before.beliefs.length : -1,
      after: after.kind === "recalled" ? after.beliefs.length : -1,
    }) + "\\n");
  } else {
    await recall();
    await waitFor(delay);
    const response = await handleRequest({
      kind: "assert",
      idempotencyKey: mode,
      onConflict: "fail",
      draft: {
        entity: "process:test",
        attribute: mode,
        value: { kind: "text", text: mode },
        provenance: { kind: "told", by: "process-test", session: mode },
        validity: { kind: "until-superseded" },
      },
    });
    process.stdout.write(JSON.stringify({ kind: response.kind }) + "\\n");
  }
`;

type WorkerResult = { code: number | null; output: string };

function runWorker(
  home: string,
  mode: string,
  delay: number,
): Promise<WorkerResult> {
  return new Promise((resolveWorker, reject) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      CAIRN_HOME: home,
      CAIRN_TEST_MODE: mode,
      CAIRN_TEST_DELAY: String(delay),
    };
    delete env.CAIRN_DB_PATH;

    const child = spawn(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", WORKER],
      { cwd: repoRoot, env, stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      output += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolveWorker({ code, output }));
  });
}

describe("store process coordination", () => {
  const roots: string[] = [];

  after(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  it("keeps concurrent writes and refreshes long-lived readers", async () => {
    const root = mkdtempSync(join(tmpdir(), "cairn-store-process-"));
    roots.push(root);
    const home = join(root, ".cairn");

    const reader = runWorker(home, "reader", 250);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
    const writer = runWorker(home, "external", 100);
    const readerResult = await reader;
    const writerResult = await writer;

    assert.equal(readerResult.code, 0, readerResult.output);
    assert.equal(writerResult.code, 0, writerResult.output);
    assert.deepEqual(JSON.parse(readerResult.output.trim()), {
      before: 0,
      after: 1,
    });
    assert.match(writerResult.output, /"kind":"asserted"/);

    const firstWriter = runWorker(home, "writer-a", 200);
    const secondWriter = runWorker(home, "writer-b", 50);
    const [firstResult, secondResult] = await Promise.all([
      firstWriter,
      secondWriter,
    ]);
    assert.equal(firstResult.code, 0, firstResult.output);
    assert.equal(secondResult.code, 0, secondResult.output);
    assert.match(firstResult.output, /"kind":"asserted"/);
    assert.match(secondResult.output, /"kind":"asserted"/);

    const previousHome = process.env.CAIRN_HOME;
    const previousDbPath = process.env.CAIRN_DB_PATH;
    process.env.CAIRN_HOME = home;
    delete process.env.CAIRN_DB_PATH;
    const recalled = await handleRequest({
      kind: "recall",
      query: {
        kind: "exact",
        entity: asEntityId("process:test"),
        attribute: asAttributeId("writer-a"),
      },
    });
    assert.equal(recalled.kind, "recalled");
    if (recalled.kind !== "recalled") return;
    assert.equal(recalled.beliefs.length, 1);
    const all = await handleRequest({ kind: "recall", query: { kind: "all" } });
    assert.equal(all.kind, "recalled");
    if (all.kind !== "recalled") return;
    assert.deepEqual(
      all.beliefs.map((belief) => belief.current.attribute).sort(),
      ["external", "writer-a", "writer-b"],
    );
    if (previousHome === undefined) delete process.env.CAIRN_HOME;
    else process.env.CAIRN_HOME = previousHome;
    if (previousDbPath === undefined) delete process.env.CAIRN_DB_PATH;
    else process.env.CAIRN_DB_PATH = previousDbPath;
  });
});
