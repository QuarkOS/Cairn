import type { AttributeId, EntityId, FactId, SessionId } from "./brand";

export type Value =
  | { kind: "text"; text: string }
  | { kind: "instant"; at: string }
  | { kind: "reference"; entity: EntityId }
  | { kind: "quantity"; amount: number; unit: string }
  | { kind: "flag"; flag: boolean };

export type Provenance =
  | { kind: "told"; by: string; session: SessionId }
  | { kind: "observed"; command: string; session: SessionId }
  | { kind: "inferred"; from: FactId[]; session: SessionId };

export type Validity =
  | { kind: "until-superseded" }
  | { kind: "reverify"; command: string; staleAfterSeconds: number }
  | { kind: "expires"; at: string };

export type Fact = {
  id: FactId;
  entity: EntityId;
  attribute: AttributeId;
  value: Value;
  provenance: Provenance;
  validity: Validity;
  assertedAt: string;
  supersedes: FactId | null;
};

export type AssertDraft = {
  entity: EntityId;
  attribute: AttributeId;
  value: Value;
  provenance: Provenance;
  validity: Validity;
};

export type OnConflict = "fail" | "supersede";

export type Retraction = {
  factId: FactId;
  retractedAt: string;
  reason: string;
  session: SessionId;
};

export type Stamp = {
  key: string;
  requestHash: string;
  response: CairnResponse;
};

export type Store = {
  facts: Fact[];
  retractions: Retraction[];
  stamps: Stamp[];
};

export type RecallQuery =
  | { kind: "all" }
  | { kind: "entity"; entity: EntityId }
  | { kind: "attribute"; attribute: AttributeId }
  | { kind: "exact"; entity: EntityId; attribute: AttributeId };

export type CairnRequest =
  | {
      kind: "assert";
      idempotencyKey: string;
      onConflict: OnConflict;
      draft: AssertDraft;
    }
  | {
      kind: "recall";
      query: RecallQuery;
    }
  | {
      kind: "retract";
      idempotencyKey: string;
      factId: FactId;
      reason: string;
      session: SessionId;
    };

export type Freshness = "fresh" | "stale" | "expired";

export type Assurance =
  | { kind: "told" }
  | { kind: "observed" }
  | { kind: "inferred"; from: FactId[] };

export type Belief = {
  current: Fact;
  freshness: Freshness;
  assurance: Assurance;
};

export type Remedy =
  | { kind: "use-supersede" }
  | { kind: "use-new-key" }
  | { kind: "recall-first" }
  | { kind: "fix-request" }
  | { kind: "choose-live-head" };

export type CairnError = {
  code: string;
  message: string;
  remedy: Remedy;
};

export type CairnResponse =
  | { kind: "asserted"; fact: Fact }
  | { kind: "recalled"; beliefs: Belief[]; recalledAt: string }
  | { kind: "retracted"; factId: FactId; retraction: Retraction }
  | { kind: "rejected"; error: CairnError };
