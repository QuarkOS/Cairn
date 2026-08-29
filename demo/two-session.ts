import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  asAttributeId,
  asEntityId,
  asSessionId,
  type AttributeId,
} from "../src/lib/cairn/brand";
import type {
  Assurance,
  CairnError,
  CairnResponse,
  Freshness,
  Value,
} from "../src/lib/cairn/model";
import { handleRequest } from "../src/lib/cairn/store";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectHome = join(repoRoot, ".cairn");
const entity = asEntityId("repo:QuarkOS/Cairn");

type Evidence =
  | {
      kind: "asserted";
      factId: string;
      entity: string;
      attribute: string;
      value: Value;
    }
  | {
      kind: "recalled";
      recalledAt: string;
      beliefs: Array<{
        factId: string;
        entity: string;
        attribute: string;
        value: Value;
        freshness: Freshness;
        assurance: Assurance;
      }>;
    }
  | {
      kind: "retracted";
      factId: string;
      reason: string;
    }
  | {
      kind: "rejected";
      error: CairnError;
    };

function pinProjectHome(): void {
  if (!process.env.CAIRN_HOME?.trim()) {
    if (!existsSync(projectHome)) {
      throw new Error(
        "Run `node bin/cairn.mjs init --project` first, or set CAIRN_HOME.",
      );
    }
    process.env.CAIRN_HOME = projectHome;
  }
  delete process.env.CAIRN_DB_PATH;
}

function evidenceOf(response: CairnResponse): Evidence {
  switch (response.kind) {
    case "asserted":
      return {
        kind: "asserted",
        factId: response.fact.id,
        entity: response.fact.entity,
        attribute: response.fact.attribute,
        value: response.fact.value,
      };
    case "recalled":
      return {
        kind: "recalled",
        recalledAt: response.recalledAt,
        beliefs: response.beliefs.map((belief) => ({
          factId: belief.current.id,
          entity: belief.current.entity,
          attribute: belief.current.attribute,
          value: belief.current.value,
          freshness: belief.freshness,
          assurance: belief.assurance,
        })),
      };
    case "retracted":
      return {
        kind: "retracted",
        factId: response.factId,
        reason: response.retraction.reason,
      };
    case "rejected":
      return {
        kind: "rejected",
        error: response.error,
      };
    default: {
      const _exhaustive: never = response;
      return _exhaustive;
    }
  }
}

function print(label: string, response: CairnResponse): void {
  process.stdout.write(
    `\n## ${label}\n${JSON.stringify(evidenceOf(response), null, 2)}\n`,
  );
}

async function session1(): Promise<void> {
  const drafts: Array<{
    idempotencyKey: string;
    attribute: AttributeId;
    value: Value;
  }> = [
    {
      idempotencyKey: "demo-s1-desk-port",
      attribute: asAttributeId("desk.port"),
      value: { kind: "quantity", amount: 4721, unit: "tcp-port" },
    },
    {
      idempotencyKey: "demo-s1-npm-name",
      attribute: asAttributeId("npm.name"),
      value: { kind: "text", text: "@quarkos/cairn" },
    },
    {
      idempotencyKey: "demo-s1-cairn-home-resolution",
      attribute: asAttributeId("cairn.home.resolution"),
      value: {
        kind: "text",
        text: "CAIRN_HOME, else ./.cairn, else ~/.cairn",
      },
    },
  ];

  for (const draft of drafts) {
    const response = await handleRequest({
      kind: "assert",
      idempotencyKey: draft.idempotencyKey,
      onConflict: "fail",
      draft: {
        entity,
        attribute: draft.attribute,
        value: draft.value,
        provenance: {
          kind: "observed",
          command: "cat package.json README.md src/lib/cairn/paths.ts",
          session: asSessionId("demo-s1"),
        },
        validity: { kind: "until-superseded" },
      },
    });
    print(`session-1 assert ${draft.idempotencyKey}`, response);
    if (response.kind === "rejected") process.exitCode = 1;
  }
}

async function session2(): Promise<void> {
  const recalled = await handleRequest({
    kind: "recall",
    query: { kind: "entity", entity },
  });
  print("session-2 recall", recalled);
  if (recalled.kind !== "recalled") {
    process.exitCode = 1;
    return;
  }

  const target = recalled.beliefs.find(
    (belief) => belief.current.attribute === "cairn.home.resolution",
  );
  if (!target) {
    process.stderr.write(
      "session-2: missing cairn.home.resolution belief after recall\n",
    );
    process.exitCode = 1;
    return;
  }

  const retracted = await handleRequest({
    kind: "retract",
    idempotencyKey: "demo-s2-retract-cairn-home-resolution",
    factId: target.current.id,
    reason:
      "Demo session two retracts one live fact to prove the store outlives the process",
    session: asSessionId("demo-s2"),
  });
  print("session-2 retract", retracted);
  if (retracted.kind === "rejected") process.exitCode = 1;

  const after = await handleRequest({
    kind: "recall",
    query: { kind: "entity", entity },
  });
  print("session-2 recall after retract", after);
  if (after.kind !== "recalled") {
    process.exitCode = 1;
    return;
  }
  const stillLive = after.beliefs.some(
    (belief) => belief.current.attribute === "cairn.home.resolution",
  );
  if (stillLive) {
    process.stderr.write(
      "session-2: cairn.home.resolution still live after retract\n",
    );
    process.exitCode = 1;
  }
}

function runChild(session: "session-1" | "session-2"): void {
  const tsxCli = join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const result = spawnSync(
    process.execPath,
    [tsxCli, fileURLToPath(import.meta.url), session],
    {
      cwd: repoRoot,
      env: process.env,
      stdio: "inherit",
    },
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function main(): Promise<void> {
  pinProjectHome();
  const arg = process.argv[2];
  if (arg === "session-1") {
    await session1();
    return;
  }
  if (arg === "session-2") {
    await session2();
    return;
  }
  if (arg !== undefined) {
    throw new Error(`Unknown argument: ${arg}`);
  }
  runChild("session-1");
  runChild("session-2");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
