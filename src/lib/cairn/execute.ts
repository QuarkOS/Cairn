import { createHash } from "node:crypto";

import { asFactId, asSessionId } from "./brand";
import type { FactId } from "./brand";
import type {
  Assurance,
  Belief,
  CairnRequest,
  CairnResponse,
  Fact,
  Freshness,
  RecallQuery,
  Retraction,
  Stamp,
  Store,
} from "./model";

export const DAY_MS = 86_400_000;

export function isoOf(ms: number): string {
  return new Date(ms).toISOString();
}

export function execute(
  store: Store,
  request: CairnRequest,
  nowMs: number,
): { store: Store; response: CairnResponse } {
  switch (request.kind) {
    case "assert":
      return executeAssert(store, request, nowMs);
    case "recall":
      return {
        store,
        response: {
          kind: "recalled",
          beliefs: recallBeliefs(store, request.query, nowMs),
          recalledAt: isoOf(nowMs),
        },
      };
    case "retract":
      return executeRetract(store, request, nowMs);
  }
}

function executeAssert(
  store: Store,
  request: Extract<CairnRequest, { kind: "assert" }>,
  nowMs: number,
): { store: Store; response: CairnResponse } {
  const hash = requestHash(request);
  const replay = replayStamp(store, request.idempotencyKey, hash);
  if (replay) return { store, response: replay };

  const live = findLiveHead(store, request.draft.entity, request.draft.attribute);
  if (live && request.onConflict === "fail") {
    const response: CairnResponse = {
      kind: "rejected",
      error: {
        code: "conflict",
        message: `Live belief already exists for ${request.draft.entity} / ${request.draft.attribute}`,
        remedy: { kind: "use-supersede" },
      },
    };
    return {
      store: withStamp(store, {
        key: request.idempotencyKey,
        requestHash: hash,
        response,
      }),
      response,
    };
  }

  const fact: Fact = {
    id: nextFactId(store),
    entity: request.draft.entity,
    attribute: request.draft.attribute,
    value: request.draft.value,
    provenance: request.draft.provenance,
    validity: request.draft.validity,
    assertedAt: isoOf(nowMs),
    supersedes: live && request.onConflict === "supersede" ? live.id : null,
  };

  const response: CairnResponse = { kind: "asserted", fact };
  return {
    store: {
      facts: [...store.facts, fact],
      retractions: store.retractions,
      stamps: [
        ...store.stamps,
        { key: request.idempotencyKey, requestHash: hash, response },
      ],
    },
    response,
  };
}

function executeRetract(
  store: Store,
  request: Extract<CairnRequest, { kind: "retract" }>,
  nowMs: number,
): { store: Store; response: CairnResponse } {
  const hash = requestHash(request);
  const replay = replayStamp(store, request.idempotencyKey, hash);
  if (replay) return { store, response: replay };

  const fact = store.facts.find((f) => f.id === request.factId);
  if (!fact) {
    const response: CairnResponse = {
      kind: "rejected",
      error: {
        code: "unknown-fact",
        message: `No fact with id ${request.factId}`,
        remedy: { kind: "recall-first" },
      },
    };
    return {
      store: withStamp(store, {
        key: request.idempotencyKey,
        requestHash: hash,
        response,
      }),
      response,
    };
  }

  if (store.retractions.some((r) => r.factId === request.factId)) {
    const response: CairnResponse = {
      kind: "rejected",
      error: {
        code: "already-retracted",
        message: `Fact ${request.factId} is already retracted`,
        remedy: { kind: "choose-live-head" },
      },
    };
    return {
      store: withStamp(store, {
        key: request.idempotencyKey,
        requestHash: hash,
        response,
      }),
      response,
    };
  }

  if (!isLiveHead(store, fact)) {
    const response: CairnResponse = {
      kind: "rejected",
      error: {
        code: "not-live",
        message: `Fact ${request.factId} is not a live belief head`,
        remedy: { kind: "choose-live-head" },
      },
    };
    return {
      store: withStamp(store, {
        key: request.idempotencyKey,
        requestHash: hash,
        response,
      }),
      response,
    };
  }

  const retraction: Retraction = {
    factId: request.factId,
    retractedAt: isoOf(nowMs),
    reason: request.reason,
    session: asSessionId(request.session),
  };
  const response: CairnResponse = {
    kind: "retracted",
    factId: request.factId,
    retraction,
  };
  return {
    store: {
      facts: store.facts,
      retractions: [...store.retractions, retraction],
      stamps: [
        ...store.stamps,
        { key: request.idempotencyKey, requestHash: hash, response },
      ],
    },
    response,
  };
}

export function recallBeliefs(
  store: Store,
  query: RecallQuery,
  nowMs: number,
): Belief[] {
  const heads = liveHeads(store).filter((fact) => matchesQuery(fact, query));
  return heads
    .map((current) => ({
      current,
      freshness: freshnessOf(current, nowMs),
      assurance: assuranceOf(current),
    }))
    .sort((a, b) => a.current.assertedAt.localeCompare(b.current.assertedAt));
}

function matchesQuery(fact: Fact, query: RecallQuery): boolean {
  switch (query.kind) {
    case "all":
      return true;
    case "entity":
      return fact.entity === query.entity;
    case "attribute":
      return fact.attribute === query.attribute;
    case "exact":
      return fact.entity === query.entity && fact.attribute === query.attribute;
  }
}

export function freshnessOf(fact: Fact, nowMs: number): Freshness {
  switch (fact.validity.kind) {
    case "until-superseded":
      return "fresh";
    case "reverify": {
      const assertedMs = Date.parse(fact.assertedAt);
      const staleAt = assertedMs + fact.validity.staleAfterSeconds * 1000;
      return nowMs >= staleAt ? "stale" : "fresh";
    }
    case "expires": {
      const expiresAt = Date.parse(fact.validity.at);
      return nowMs >= expiresAt ? "expired" : "fresh";
    }
  }
}

export function assuranceOf(fact: Fact): Assurance {
  switch (fact.provenance.kind) {
    case "told":
      return { kind: "told" };
    case "observed":
      return { kind: "observed" };
    case "inferred":
      return { kind: "inferred", from: [...fact.provenance.from] };
  }
}

function liveHeads(store: Store): Fact[] {
  const retractedIds = new Set(store.retractions.map((r) => r.factId));
  const active = store.facts.filter((f) => !retractedIds.has(f.id));
  const superseded = new Set(
    active.map((f) => f.supersedes).filter((id): id is FactId => id !== null),
  );
  return active.filter((f) => !superseded.has(f.id));
}

function findLiveHead(
  store: Store,
  entity: Fact["entity"],
  attribute: Fact["attribute"],
): Fact | null {
  return (
    liveHeads(store).find(
      (f) => f.entity === entity && f.attribute === attribute,
    ) ?? null
  );
}

function isLiveHead(store: Store, fact: Fact): boolean {
  return liveHeads(store).some((f) => f.id === fact.id);
}

function nextFactId(store: Store): FactId {
  let max = 0;
  for (const fact of store.facts) {
    const match = /^f-(\d+)$/.exec(fact.id);
    if (match) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return asFactId(`f-${String(max + 1).padStart(4, "0")}`);
}

function requestHash(request: CairnRequest): string {
  return createHash("sha256")
    .update(stableStringify(request))
    .digest("hex");
}

function replayStamp(
  store: Store,
  key: string,
  hash: string,
): CairnResponse | null {
  const stamp = store.stamps.find((s) => s.key === key);
  if (!stamp) return null;
  if (stamp.requestHash === hash) return stamp.response;
  return {
    kind: "rejected",
    error: {
      code: "idempotency-conflict",
      message: `Idempotency key ${key} was used with a different request body`,
      remedy: { kind: "use-new-key" },
    },
  };
}

function withStamp(store: Store, stamp: Stamp): Store {
  const without = store.stamps.filter((s) => s.key !== stamp.key);
  return { ...store, stamps: [...without, stamp] };
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => a.localeCompare(b),
    );
    const out: Record<string, unknown> = {};
    for (const [k, v] of entries) out[k] = sortKeys(v);
    return out;
  }
  return value;
}
