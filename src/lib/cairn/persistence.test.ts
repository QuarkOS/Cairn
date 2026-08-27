import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { asAttributeId, asEntityId, asSessionId } from "./brand";
import { execute } from "./execute";
import type { CairnRequest, CairnResponse, Store } from "./model";
import {
  loadStoreFromDb,
  saveStoreToDb,
  withStoreTransaction,
} from "./persistence";

const NOW = Date.parse("2026-08-24T12:00:00.000Z");

describe("append-only persistence", () => {
  const roots: string[] = [];

  after(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  it("writes assertion, conflict, supersede, and retraction suffixes with INSERT only", () => {
    const root = mkdtempSync(join(tmpdir(), "cairn-persistence-flow-"));
    roots.push(root);
    const dbPath = join(root, "cairn.db");

    const firstRequest = assertRequest(
      "flow-assert",
      "fail",
      "old command",
    );
    const first = transact(dbPath, firstRequest, NOW);
    assert.equal(first.kind, "asserted");
    if (first.kind !== "asserted") return;

    installMutationGuards(dbPath);

    const conflict = transact(
      dbPath,
      assertRequest("flow-conflict", "fail", "conflicting command"),
      NOW + 1,
    );
    assert.equal(conflict.kind, "rejected");

    const superseded = transact(
      dbPath,
      assertRequest("flow-supersede", "supersede", "new command"),
      NOW + 2,
    );
    assert.equal(superseded.kind, "asserted");
    if (superseded.kind !== "asserted") return;
    assert.equal(superseded.fact.supersedes, first.fact.id);

    const retractRequest: CairnRequest = {
      kind: "retract",
      idempotencyKey: "flow-retract",
      factId: superseded.fact.id,
      reason: "command completed",
      session: asSessionId("persistence-test"),
    };
    const retracted = transact(dbPath, retractRequest, NOW + 3);
    assert.equal(retracted.kind, "retracted");

    const afterWrites = counts(dbPath);
    assert.deepEqual(afterWrites, { facts: 2, retractions: 1, stamps: 4 });

    const replayedAssert = transact(dbPath, firstRequest, NOW + 4);
    assert.deepEqual(replayedAssert, first);
    const replayedRetract = transact(dbPath, retractRequest, NOW + 5);
    assert.deepEqual(replayedRetract, retracted);
    assert.deepEqual(counts(dbPath), afterWrites);

    assertMutationGuardsFire(dbPath);
  });

  it("rejects mutation and removal atomically, including in-place callback edits", () => {
    const root = mkdtempSync(join(tmpdir(), "cairn-persistence-invariant-"));
    roots.push(root);
    const dbPath = join(root, "cairn.db");

    const asserted = transact(
      dbPath,
      assertRequest("invariant-assert", "fail", "stable"),
      NOW,
    );
    assert.equal(asserted.kind, "asserted");
    if (asserted.kind !== "asserted") return;

    const retracted = transact(
      dbPath,
      {
        kind: "retract",
        idempotencyKey: "invariant-retract",
        factId: asserted.fact.id,
        reason: "test cleanup",
        session: asSessionId("persistence-test"),
      },
      NOW + 1,
    );
    assert.equal(retracted.kind, "retracted");

    const before = loadStoreFromDb(dbPath, NOW + 1);
    const fact = before.facts[0];
    assert.ok(fact);

    const changed: Store = {
      facts: before.facts.map((entry) =>
        entry.id === fact.id
          ? { ...entry, assertedAt: new Date(NOW + 2).toISOString() }
          : entry,
      ),
      retractions: before.retractions,
      stamps: [
        ...before.stamps,
        testStamp("should-not-commit-change"),
      ],
    };
    assert.throws(
      () =>
        saveStoreToDb(dbPath, changed),
      /append-only invariant/i,
    );
    assert.deepEqual(loadStoreFromDb(dbPath, NOW + 2), before);

    const removed: Store = {
      facts: before.facts.slice(1),
      retractions: before.retractions,
      stamps: [...before.stamps, testStamp("should-not-commit-removal")],
    };
    assert.throws(
      () =>
        withStoreTransaction(dbPath, () => ({
          store: removed,
          value: undefined,
        })),
      /append-only invariant/i,
    );
    assert.deepEqual(loadStoreFromDb(dbPath, NOW + 2), before);

    assert.throws(
      () =>
        withStoreTransaction(dbPath, (current) => {
          current.facts.pop();
          return { store: current, value: undefined };
        }),
      /append-only invariant/i,
    );
    assert.deepEqual(loadStoreFromDb(dbPath, NOW + 2), before);
  });

  it("keeps saveStoreToDb compatible for additive snapshots without a rewrite backdoor", () => {
    const root = mkdtempSync(join(tmpdir(), "cairn-persistence-save-"));
    roots.push(root);
    const dbPath = join(root, "cairn.db");

    const firstRequest = assertRequest("save-first", "fail", "one");
    const first = transact(dbPath, firstRequest, NOW);
    assert.equal(first.kind, "asserted");
    if (first.kind !== "asserted") return;

    const current = loadStoreFromDb(dbPath, NOW);
    const secondRequest = assertRequest(
      "save-second",
      "fail",
      "two",
      "deploy.secondary",
    );
    const second = execute(current, secondRequest, NOW + 1);
    assert.equal(second.response.kind, "asserted");
    saveStoreToDb(dbPath, second.store);
    assert.deepEqual(counts(dbPath), { facts: 2, retractions: 0, stamps: 2 });

    const before = loadStoreFromDb(dbPath, NOW + 1);
    assert.throws(
      () => saveStoreToDb(dbPath, { facts: [], retractions: [], stamps: [] }),
      /append-only invariant/i,
    );
    assert.deepEqual(loadStoreFromDb(dbPath, NOW + 2), before);
  });
});

function assertRequest(
  idempotencyKey: string,
  onConflict: "fail" | "supersede",
  text: string,
  attribute = "deploy.command",
): CairnRequest {
  return {
    kind: "assert",
    idempotencyKey,
    onConflict,
    draft: {
      entity: asEntityId("repo:cairn"),
      attribute: asAttributeId(attribute),
      value: { kind: "text", text },
      provenance: {
        kind: "observed",
        command: "persistence-test",
        session: asSessionId("persistence-test"),
      },
      validity: { kind: "until-superseded" },
    },
  };
}

function transact(
  dbPath: string,
  request: CairnRequest,
  nowMs: number,
): CairnResponse {
  return withStoreTransaction(dbPath, (store) => {
    const result = execute(store, request, nowMs);
    return { store: result.store, value: result.response };
  });
}

function counts(dbPath: string): {
  facts: number;
  retractions: number;
  stamps: number;
} {
  const db = new Database(dbPath);
  try {
    return {
      facts: count(db, "facts"),
      retractions: count(db, "retractions"),
      stamps: count(db, "stamps"),
    };
  } finally {
    db.close();
  }
}

function count(db: Database.Database, table: "facts" | "retractions" | "stamps"): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS count FROM ${table}`)
    .get() as { count: number };
  return row.count;
}

function installMutationGuards(dbPath: string): void {
  const db = new Database(dbPath);
  try {
    db.exec(`
      CREATE TRIGGER block_facts_update
      BEFORE UPDATE ON facts
      BEGIN
        SELECT RAISE(ABORT, 'facts are append-only');
      END;
      CREATE TRIGGER block_facts_delete
      BEFORE DELETE ON facts
      BEGIN
        SELECT RAISE(ABORT, 'facts are append-only');
      END;
      CREATE TRIGGER block_retractions_update
      BEFORE UPDATE ON retractions
      BEGIN
        SELECT RAISE(ABORT, 'retractions are append-only');
      END;
      CREATE TRIGGER block_retractions_delete
      BEFORE DELETE ON retractions
      BEGIN
        SELECT RAISE(ABORT, 'retractions are append-only');
      END;
      CREATE TRIGGER block_stamps_update
      BEFORE UPDATE ON stamps
      BEGIN
        SELECT RAISE(ABORT, 'stamps are append-only');
      END;
      CREATE TRIGGER block_stamps_delete
      BEFORE DELETE ON stamps
      BEGIN
        SELECT RAISE(ABORT, 'stamps are append-only');
      END;
    `);
  } finally {
    db.close();
  }
}

function assertMutationGuardsFire(dbPath: string): void {
  const db = new Database(dbPath);
  try {
    const fact = db
      .prepare("SELECT id FROM facts ORDER BY rowid LIMIT 1")
      .get() as { id: string };
    const retraction = db
      .prepare("SELECT fact_id FROM retractions ORDER BY rowid LIMIT 1")
      .get() as { fact_id: string };
    const stamp = db
      .prepare("SELECT key FROM stamps ORDER BY rowid LIMIT 1")
      .get() as { key: string };

    assert.throws(
      () => db.prepare("UPDATE facts SET body = body WHERE id = ?").run(fact.id),
      /facts are append-only/,
    );
    assert.throws(
      () => db.prepare("DELETE FROM facts WHERE id = ?").run(fact.id),
      /facts are append-only/,
    );
    assert.throws(
      () =>
        db
          .prepare("UPDATE retractions SET body = body WHERE fact_id = ?")
          .run(retraction.fact_id),
      /retractions are append-only/,
    );
    assert.throws(
      () =>
        db.prepare("DELETE FROM retractions WHERE fact_id = ?").run(retraction.fact_id),
      /retractions are append-only/,
    );
    assert.throws(
      () => db.prepare("UPDATE stamps SET body = body WHERE key = ?").run(stamp.key),
      /stamps are append-only/,
    );
    assert.throws(
      () => db.prepare("DELETE FROM stamps WHERE key = ?").run(stamp.key),
      /stamps are append-only/,
    );
  } finally {
    db.close();
  }
}

function testStamp(key: string): Store["stamps"][number] {
  return {
    key,
    requestHash: "test-hash",
    response: {
      kind: "rejected",
      error: {
        code: "test",
        message: "test stamp",
        remedy: { kind: "fix-request" },
      },
    },
  };
}
