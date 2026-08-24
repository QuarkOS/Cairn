import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import type { Fact, Retraction, Stamp, Store } from "./model";
import { seedStore } from "./seed";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS facts (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS retractions (
  fact_id TEXT PRIMARY KEY,
  body TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stamps (
  key TEXT PRIMARY KEY,
  body TEXT NOT NULL
);
`;

export function loadStoreFromDb(dbPath: string, nowMs: number): Store {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  try {
    db.exec(SCHEMA);
    const factCount = (
      db.prepare("SELECT COUNT(*) AS n FROM facts").get() as { n: number }
    ).n;
    if (factCount === 0) {
      const seeded = seedStore(nowMs);
      writeStore(db, seeded);
      return cloneStore(seeded);
    }
    return readStore(db);
  } finally {
    db.close();
  }
}

export function saveStoreToDb(dbPath: string, store: Store): void {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  try {
    db.exec(SCHEMA);
    db.transaction(() => {
      db.exec("DELETE FROM facts");
      db.exec("DELETE FROM retractions");
      db.exec("DELETE FROM stamps");
      writeStore(db, store);
    })();
  } finally {
    db.close();
  }
}

export function resetDb(dbPath: string, nowMs: number): Store {
  mkdirSync(dirname(dbPath), { recursive: true });
  const seeded = seedStore(nowMs);
  const db = new Database(dbPath);
  try {
    db.exec(SCHEMA);
    db.transaction(() => {
      db.exec("DELETE FROM facts");
      db.exec("DELETE FROM retractions");
      db.exec("DELETE FROM stamps");
      writeStore(db, seeded);
    })();
    return cloneStore(seeded);
  } finally {
    db.close();
  }
}

function writeStore(db: Database.Database, store: Store): void {
  const insertFact = db.prepare(
    "INSERT INTO facts (id, body) VALUES (@id, @body)",
  );
  const insertRetraction = db.prepare(
    "INSERT INTO retractions (fact_id, body) VALUES (@fact_id, @body)",
  );
  const insertStamp = db.prepare(
    "INSERT INTO stamps (key, body) VALUES (@key, @body)",
  );

  for (const fact of store.facts) {
    insertFact.run({ id: fact.id, body: JSON.stringify(fact) });
  }
  for (const retraction of store.retractions) {
    insertRetraction.run({
      fact_id: retraction.factId,
      body: JSON.stringify(retraction),
    });
  }
  for (const stamp of store.stamps) {
    insertStamp.run({ key: stamp.key, body: JSON.stringify(stamp) });
  }
}

function readStore(db: Database.Database): Store {
  const facts = (
    db.prepare("SELECT body FROM facts").all() as { body: string }[]
  ).map((row) => JSON.parse(row.body) as Fact);

  const retractions = (
    db.prepare("SELECT body FROM retractions").all() as { body: string }[]
  ).map((row) => JSON.parse(row.body) as Retraction);

  const stamps = (
    db.prepare("SELECT body FROM stamps").all() as { body: string }[]
  ).map((row) => JSON.parse(row.body) as Stamp);

  return { facts, retractions, stamps };
}

function cloneStore(store: Store): Store {
  return structuredClone(store);
}
