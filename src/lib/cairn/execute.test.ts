import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { asAttributeId, asEntityId, asFactId, asSessionId } from "./brand";
import { DAY_MS, execute, freshnessOf, isoOf } from "./execute";
import type { AssertDraft, CairnRequest, Store } from "./model";
import { parseCairnRequest } from "./parse";
import { loadStoreFromDb, resetDb, saveStoreToDb } from "./persistence";
import { resolveCairnPaths } from "./paths";
import { seedStore } from "./seed";

function emptyStore(): Store {
  return { facts: [], retractions: [], stamps: [] };
}

function textDraft(
  entity: string,
  attribute: string,
  text: string,
): AssertDraft {
  return {
    entity: asEntityId(entity),
    attribute: asAttributeId(attribute),
    value: { kind: "text", text },
    provenance: {
      kind: "observed",
      command: "test",
      session: asSessionId("s-test"),
    },
    validity: { kind: "until-superseded" },
  };
}

describe("execute assert/recall/retract", () => {
  const now = Date.parse("2026-08-24T12:00:00.000Z");

  it("asserts a fact and recalls it as a live belief", () => {
    const assertReq: CairnRequest = {
      kind: "assert",
      idempotencyKey: "k-1",
      onConflict: "fail",
      draft: textDraft("env:verify", "verify.marker", "hello"),
    };
    const asserted = execute(emptyStore(), assertReq, now);
    assert.equal(asserted.response.kind, "asserted");
    if (asserted.response.kind !== "asserted") return;

    const recalled = execute(
      asserted.store,
      { kind: "recall", query: { kind: "all" } },
      now,
    );
    assert.equal(recalled.response.kind, "recalled");
    if (recalled.response.kind !== "recalled") return;
    assert.equal(recalled.response.beliefs.length, 1);
    assert.equal(recalled.response.beliefs[0]?.current.id, asserted.response.fact.id);
    assert.equal(recalled.response.beliefs[0]?.freshness, "fresh");
    assert.equal(recalled.response.beliefs[0]?.assurance.kind, "observed");
  });

  it("replays identical assert via idempotency key", () => {
    const req: CairnRequest = {
      kind: "assert",
      idempotencyKey: "k-idem",
      onConflict: "fail",
      draft: textDraft("env:a", "attr.x", "one"),
    };
    const first = execute(emptyStore(), req, now);
    const second = execute(first.store, req, now + 1000);
    assert.equal(first.response.kind, "asserted");
    assert.equal(second.response.kind, "asserted");
    assert.deepEqual(first.response, second.response);
    assert.equal(second.store.facts.length, 1);
  });

  it("rejects idempotency key reuse with a different body", () => {
    const firstReq: CairnRequest = {
      kind: "assert",
      idempotencyKey: "k-reuse",
      onConflict: "fail",
      draft: textDraft("env:a", "attr.x", "one"),
    };
    const secondReq: CairnRequest = {
      kind: "assert",
      idempotencyKey: "k-reuse",
      onConflict: "fail",
      draft: textDraft("env:a", "attr.x", "two"),
    };
    const first = execute(emptyStore(), firstReq, now);
    const second = execute(first.store, secondReq, now);
    assert.equal(second.response.kind, "rejected");
    if (second.response.kind !== "rejected") return;
    assert.equal(second.response.error.remedy.kind, "use-new-key");
    assert.equal(second.store.facts.length, 1);
  });

  it("fails on conflict and supersedes when requested", () => {
    const firstReq: CairnRequest = {
      kind: "assert",
      idempotencyKey: "k-c1",
      onConflict: "fail",
      draft: textDraft("repo:x", "deploy.command", "old"),
    };
    const first = execute(emptyStore(), firstReq, now);
    assert.equal(first.response.kind, "asserted");

    const failReq: CairnRequest = {
      kind: "assert",
      idempotencyKey: "k-c2",
      onConflict: "fail",
      draft: textDraft("repo:x", "deploy.command", "new"),
    };
    const failed = execute(first.store, failReq, now + 1);
    assert.equal(failed.response.kind, "rejected");
    if (failed.response.kind !== "rejected") return;
    assert.equal(failed.response.error.remedy.kind, "use-supersede");

    const supersedeReq: CairnRequest = {
      kind: "assert",
      idempotencyKey: "k-c3",
      onConflict: "supersede",
      draft: textDraft("repo:x", "deploy.command", "new"),
    };
    const superseded = execute(first.store, supersedeReq, now + 2);
    assert.equal(superseded.response.kind, "asserted");
    if (
      first.response.kind !== "asserted" ||
      superseded.response.kind !== "asserted"
    ) {
      return;
    }
    assert.equal(
      superseded.response.fact.supersedes,
      first.response.fact.id,
    );

    const recalled = execute(
      superseded.store,
      { kind: "recall", query: { kind: "exact", entity: asEntityId("repo:x"), attribute: asAttributeId("deploy.command") } },
      now + 2,
    );
    assert.equal(recalled.response.kind, "recalled");
    if (recalled.response.kind !== "recalled") return;
    assert.equal(recalled.response.beliefs.length, 1);
    assert.equal(recalled.response.beliefs[0]?.current.value.kind, "text");
    if (recalled.response.beliefs[0]?.current.value.kind === "text") {
      assert.equal(recalled.response.beliefs[0].current.value.text, "new");
    }
  });

  it("retracts a live head and omits it from recall", () => {
    const assertReq: CairnRequest = {
      kind: "assert",
      idempotencyKey: "k-r1",
      onConflict: "fail",
      draft: textDraft("ticket:1", "status", "open"),
    };
    const asserted = execute(emptyStore(), assertReq, now);
    assert.equal(asserted.response.kind, "asserted");
    if (asserted.response.kind !== "asserted") return;

    const retractReq: CairnRequest = {
      kind: "retract",
      idempotencyKey: "k-r2",
      factId: asserted.response.fact.id,
      reason: "done",
      session: asSessionId("s-test"),
    };
    const retracted = execute(asserted.store, retractReq, now + 1);
    assert.equal(retracted.response.kind, "retracted");

    const recalled = execute(
      retracted.store,
      { kind: "recall", query: { kind: "all" } },
      now + 1,
    );
    assert.equal(recalled.response.kind, "recalled");
    if (recalled.response.kind !== "recalled") return;
    assert.equal(recalled.response.beliefs.length, 0);

    const replay = execute(retracted.store, retractReq, now + 2);
    assert.equal(replay.response.kind, "retracted");
    assert.equal(replay.store.retractions.length, 1);
  });

  it("computes freshness for reverify and expires", () => {
    const store = seedStore(now);
    const flaky = store.facts.find((f) => f.id === "f-0090");
    const cert = store.facts.find((f) => f.id === "f-0095");
    assert.ok(flaky);
    assert.ok(cert);
    assert.equal(freshnessOf(flaky, now), "stale");
    assert.equal(freshnessOf(cert, now), "expired");
    assert.equal(isoOf(now - DAY_MS).endsWith("Z"), true);
  });
});

describe("parseCairnRequest", () => {
  it("parses a valid assert and rejects garbage", () => {
    const ok = parseCairnRequest({
      kind: "assert",
      idempotencyKey: "k",
      onConflict: "fail",
      draft: {
        entity: "env:x",
        attribute: "a.b",
        value: { kind: "flag", flag: true },
        provenance: { kind: "told", by: "mira", session: "s-1" },
        validity: { kind: "until-superseded" },
      },
    });
    assert.equal(ok.ok, true);

    const bad = parseCairnRequest({ kind: "assert" });
    assert.equal(bad.ok, false);
    if (bad.ok) return;
    assert.equal(bad.response.kind, "rejected");
    assert.equal(bad.response.error.remedy.kind, "fix-request");
  });
});

describe("persistence + paths", () => {
  const root = mkdtempSync(join(tmpdir(), "cairn-test-"));
  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("seeds an empty db and round-trips asserts", () => {
    const dbPath = join(root, "cairn.db");
    const now = Date.parse("2026-08-24T12:00:00.000Z");
    const loaded = loadStoreFromDb(dbPath, now);
    assert.ok(loaded.facts.length >= 10);

    const req: CairnRequest = {
      kind: "assert",
      idempotencyKey: "persist-1",
      onConflict: "fail",
      draft: textDraft("env:persist", "persist.marker", "proof-value"),
    };
    const out = execute(loaded, req, now);
    saveStoreToDb(dbPath, out.store);

    const reloaded = loadStoreFromDb(dbPath, now + 1);
    const hit = reloaded.facts.find(
      (f) =>
        f.entity === "env:persist" &&
        f.attribute === "persist.marker" &&
        f.value.kind === "text" &&
        f.value.text === "proof-value",
    );
    assert.ok(hit);

    const reset = resetDb(dbPath, now);
    assert.equal(reset.facts.length, seedStore(now).facts.length);
    assert.equal(reset.stamps.length, 0);
  });

  it("resolveCairnPaths honors overrides and project .cairn", () => {
    const project = mkdtempSync(join(root, "proj-"));
    const cairnDir = join(project, ".cairn");
    mkdirSync(cairnDir);

    const projectPaths = resolveCairnPaths(project, {});
    assert.equal(projectPaths.home, cairnDir);
    assert.equal(projectPaths.dbPath, join(cairnDir, "cairn.db"));
    assert.equal(projectPaths.canvasPath, join(cairnDir, "canvas.json"));

    const home = join(root, "custom-home");
    const withHome = resolveCairnPaths(project, { CAIRN_HOME: home });
    assert.equal(withHome.home, home);
    assert.equal(withHome.dbPath, join(home, "cairn.db"));

    const db = join(root, "override.db");
    const withDb = resolveCairnPaths(project, { CAIRN_DB_PATH: db });
    assert.equal(withDb.dbPath, db);
  });
});

describe("seed store", () => {
  it("exposes branded helpers used by seed", () => {
    assert.equal(asFactId("f-1"), "f-1");
    assert.equal(asSessionId("s-1"), "s-1");
    const now = Date.now();
    const store = seedStore(now);
    assert.ok(store.facts.some((f) => f.supersedes === "f-0087"));
  });
});
