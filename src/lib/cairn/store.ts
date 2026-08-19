import { execute } from "./execute";
import { loadStoreFromDb, resetDb, saveStoreToDb } from "./persistence";
import { resolveCairnPaths } from "./paths";
import type { CairnRequest, CairnResponse, Store } from "./model";

let store: Store | null = null;
let dbPath: string | null = null;
let chain: Promise<unknown> = Promise.resolve();

function exclusive<T>(fn: () => T): Promise<T> {
  const run = chain.then(() => fn());
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function ensureLoaded(nowMs: number): { store: Store; dbPath: string } {
  const paths = resolveCairnPaths();
  if (store === null || dbPath !== paths.dbPath) {
    dbPath = paths.dbPath;
    store = loadStoreFromDb(paths.dbPath, nowMs);
  }
  return { store, dbPath: paths.dbPath };
}

function commit(next: Store, path: string): void {
  store = next;
  saveStoreToDb(path, next);
}

export function handleRequest(
  request: CairnRequest,
  nowMs = Date.now(),
): Promise<CairnResponse> {
  return exclusive(() => {
    const loaded = ensureLoaded(nowMs);
    const out = execute(loaded.store, request, nowMs);
    if (out.store !== loaded.store) {
      commit(out.store, loaded.dbPath);
    }
    return out.response;
  });
}

export function resetStore(nowMs = Date.now()): Promise<CairnResponse> {
  return exclusive(() => {
    const paths = resolveCairnPaths();
    dbPath = paths.dbPath;
    store = resetDb(paths.dbPath, nowMs);
    return execute(store, { kind: "recall", query: { kind: "all" } }, nowMs).response;
  });
}

export function getDbPath(): string {
  return resolveCairnPaths().dbPath;
}
