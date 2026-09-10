import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { asAttributeId, asEntityId, asFactId, asSessionId } from "./brand";
import { beliefMatchesSearch, validityText } from "./display";
import type { Belief } from "./model";

function belief(overrides: Partial<Belief["current"]> = {}): Belief {
  return {
    current: {
      id: asFactId("f-0001"),
      entity: asEntityId("env:staging"),
      attribute: asAttributeId("database.host"),
      value: { kind: "text", text: "pg-staging-2.internal" },
      provenance: {
        kind: "observed",
        command: "kubectl -n staging get svc",
        session: asSessionId("s-015"),
      },
      validity: { kind: "ttl", staleAfterSeconds: 604_800 },
      assertedAt: "2026-08-12T12:00:00.000Z",
      supersedes: null,
      ...overrides,
    },
    freshness: "stale",
    assurance: { kind: "observed" },
  };
}

describe("display", () => {
  it("formats validity kinds without a reverify command", () => {
    assert.equal(validityText({ kind: "until-superseded" }), "until-superseded");
    assert.equal(validityText({ kind: "ttl", staleAfterSeconds: 60 }), "ttl 60s");
    assert.equal(
      validityText({ kind: "expires", at: "2026-09-01T00:00:00.000Z" }),
      "expires 2026-09-01T00:00:00.000Z",
    );
  });

  it("matches search against ttl validity text", () => {
    const row = belief();
    assert.equal(beliefMatchesSearch(row, "ttl"), true);
    assert.equal(beliefMatchesSearch(row, "604800s"), true);
    assert.equal(beliefMatchesSearch(row, "reverify"), false);
  });
});
