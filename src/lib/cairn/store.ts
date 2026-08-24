import { execute } from "./execute";
import {
  resetDb,
  withStoreSnapshot,
  withStoreTransaction,
} from "./persistence";
import { resolveCairnPaths } from "./paths";
import type { CairnRequest, CairnResponse } from "./model";

export function handleRequest(
  request: CairnRequest,
  nowMs = Date.now(),
): Promise<CairnResponse> {
  const { dbPath } = resolveCairnPaths();
  if (request.kind === "recall") {
    return Promise.resolve(
      withStoreSnapshot(dbPath, (store) =>
        execute(store, request, nowMs).response,
      ),
    );
  }

  return Promise.resolve(
    withStoreTransaction(dbPath, (store) => {
      const out = execute(store, request, nowMs);
      return { store: out.store, value: out.response };
    }),
  );
}

export function resetStore(nowMs = Date.now()): Promise<CairnResponse> {
  const { dbPath } = resolveCairnPaths();
  const seeded = resetDb(dbPath, nowMs);
  return Promise.resolve(
    execute(seeded, { kind: "recall", query: { kind: "all" } }, nowMs)
      .response,
  );
}

export function getDbPath(): string {
  return resolveCairnPaths().dbPath;
}
