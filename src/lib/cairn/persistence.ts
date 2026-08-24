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

export function loadStoreFromDb(dbPath: string, _nowMs: number): Store {
  return withStoreSnapshot(dbPath, (store) => store);
}

export function withStoreSnapshot<T>(
  dbPath: string,
  read: (store: Store) => T,
): T {
  const db = openDb(dbPath);
  try {
    const transaction = db.transaction(() => read(readStore(db)));
    return transaction();
  } finally {
    db.close();
  }
}

export function withStoreTransaction<T>(
  dbPath: string,
  mutate: (store: Store) => { store: Store; value: T },
): T {
  const db = openDb(dbPath);
  try {
    const transaction = db.transaction(() => {
      const current = readStore(db);
      const result = mutate(current);
      if (result.store !== current) replaceStore(db, result.store);
      return result.value;
    });
    return transaction.immediate();
  } finally {
    db.close();
  }
}

export function saveStoreToDb(dbPath: string, store: Store): void {
  const db = openDb(dbPath);
  try {
    const transaction = db.transaction(() => replaceStore(db, store));
    transaction.immediate();
  } finally {
    db.close();
  }
}

export function resetDb(dbPath: string, nowMs: number): Store {
  const seeded = seedStore(nowMs);
  return withStoreTransaction(dbPath, () => ({
    store: seeded,
    value: cloneStore(seeded),
  }));
}

export function seedDbIfEmpty(dbPath: string, nowMs: number): Store {
  const seeded = seedStore(nowMs);
  return withStoreTransaction(dbPath, (current) => {
    if (
      current.facts.length > 0 ||
      current.retractions.length > 0 ||
      current.stamps.length > 0
    ) {
      throw new Error(
        "Refusing --demo because the Cairn store is not empty; existing data was preserved",
      );
    }
    return { store: seeded, value: cloneStore(seeded) };
  });
}

function openDb(dbPath: string): Database.Database {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("busy_timeout = 5000");
  db.exec(SCHEMA);
  return db;
}

function replaceStore(db: Database.Database, store: Store): void {
  db.exec("DELETE FROM facts");
  db.exec("DELETE FROM retractions");
  db.exec("DELETE FROM stamps");
  writeStore(db, store);
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
