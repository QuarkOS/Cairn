import {
  asAttributeId,
  asEntityId,
  asFactId,
  asSessionId,
} from "./brand";
import type { FactId, SessionId } from "./brand";
import type {
  AssertDraft,
  CairnRequest,
  CairnResponse,
  OnConflict,
  Provenance,
  RecallQuery,
  Validity,
  Value,
} from "./model";

export type ParseResult =
  | { ok: true; request: CairnRequest }
  | { ok: false; response: Extract<CairnResponse, { kind: "rejected" }> };

export function parseCairnRequest(input: unknown): ParseResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return reject("Request must be a JSON object");
  }
  const body = input as Record<string, unknown>;
  const kind = body.kind;
  if (kind === "assert") return parseAssert(body);
  if (kind === "recall") return parseRecall(body);
  if (kind === "retract") return parseRetract(body);
  return reject('Request kind must be "assert", "recall", or "retract"');
}

function parseAssert(body: Record<string, unknown>): ParseResult {
  const idempotencyKey = asNonEmptyString(body.idempotencyKey, "idempotencyKey");
  if (!idempotencyKey.ok) return idempotencyKey;

  const onConflict = parseOnConflict(body.onConflict);
  if (!onConflict.ok) return onConflict;

  const draft = parseDraft(body.draft);
  if (!draft.ok) return draft;

  return {
    ok: true,
    request: {
      kind: "assert",
      idempotencyKey: idempotencyKey.value,
      onConflict: onConflict.value,
      draft: draft.value,
    },
  };
}

function parseRecall(body: Record<string, unknown>): ParseResult {
  const query = parseQuery(body.query);
  if (!query.ok) return query;
  return { ok: true, request: { kind: "recall", query: query.value } };
}

function parseRetract(body: Record<string, unknown>): ParseResult {
  const idempotencyKey = asNonEmptyString(body.idempotencyKey, "idempotencyKey");
  if (!idempotencyKey.ok) return idempotencyKey;

  const factId = asNonEmptyString(body.factId, "factId");
  if (!factId.ok) return factId;

  const reason = asNonEmptyString(body.reason, "reason");
  if (!reason.ok) return reason;

  const session = asNonEmptyString(body.session, "session");
  if (!session.ok) return session;

  return {
    ok: true,
    request: {
      kind: "retract",
      idempotencyKey: idempotencyKey.value,
      factId: asFactId(factId.value),
      reason: reason.value,
      session: asSessionId(session.value),
    },
  };
}

function parseOnConflict(
  value: unknown,
):
  | { ok: true; value: OnConflict }
  | { ok: false; response: Extract<CairnResponse, { kind: "rejected" }> } {
  if (value === "fail" || value === "supersede") {
    return { ok: true, value };
  }
  return reject('onConflict must be "fail" or "supersede"');
}

function parseDraft(
  value: unknown,
):
  | { ok: true; value: AssertDraft }
  | { ok: false; response: Extract<CairnResponse, { kind: "rejected" }> } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return reject("draft must be an object");
  }
  const draft = value as Record<string, unknown>;

  const entity = asNonEmptyString(draft.entity, "draft.entity");
  if (!entity.ok) return entity;

  const attribute = asNonEmptyString(draft.attribute, "draft.attribute");
  if (!attribute.ok) return attribute;

  const parsedValue = parseValue(draft.value);
  if (!parsedValue.ok) return parsedValue;

  const provenance = parseProvenance(draft.provenance);
  if (!provenance.ok) return provenance;

  const validity = parseValidity(draft.validity);
  if (!validity.ok) return validity;

  return {
    ok: true,
    value: {
      entity: asEntityId(entity.value),
      attribute: asAttributeId(attribute.value),
      value: parsedValue.value,
      provenance: provenance.value,
      validity: validity.value,
    },
  };
}

function parseQuery(
  value: unknown,
):
  | { ok: true; value: RecallQuery }
  | { ok: false; response: Extract<CairnResponse, { kind: "rejected" }> } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return reject("query must be an object");
  }
  const query = value as Record<string, unknown>;
  switch (query.kind) {
    case "all":
      return { ok: true, value: { kind: "all" } };
    case "entity": {
      const entity = asNonEmptyString(query.entity, "query.entity");
      if (!entity.ok) return entity;
      return {
        ok: true,
        value: { kind: "entity", entity: asEntityId(entity.value) },
      };
    }
    case "attribute": {
      const attribute = asNonEmptyString(query.attribute, "query.attribute");
      if (!attribute.ok) return attribute;
      return {
        ok: true,
        value: {
          kind: "attribute",
          attribute: asAttributeId(attribute.value),
        },
      };
    }
    case "exact": {
      const entity = asNonEmptyString(query.entity, "query.entity");
      if (!entity.ok) return entity;
      const attribute = asNonEmptyString(query.attribute, "query.attribute");
      if (!attribute.ok) return attribute;
      return {
        ok: true,
        value: {
          kind: "exact",
          entity: asEntityId(entity.value),
          attribute: asAttributeId(attribute.value),
        },
      };
    }
    default:
      return reject(
        'query.kind must be "all", "entity", "attribute", or "exact"',
      );
  }
}

function parseValue(
  value: unknown,
):
  | { ok: true; value: Value }
  | { ok: false; response: Extract<CairnResponse, { kind: "rejected" }> } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return reject("value must be an object");
  }
  const v = value as Record<string, unknown>;
  switch (v.kind) {
    case "text": {
      const text = asNonEmptyString(v.text, "value.text");
      if (!text.ok) return text;
      return { ok: true, value: { kind: "text", text: text.value } };
    }
    case "instant": {
      const at = asNonEmptyString(v.at, "value.at");
      if (!at.ok) return at;
      return { ok: true, value: { kind: "instant", at: at.value } };
    }
    case "reference": {
      const entity = asNonEmptyString(v.entity, "value.entity");
      if (!entity.ok) return entity;
      return {
        ok: true,
        value: { kind: "reference", entity: asEntityId(entity.value) },
      };
    }
    case "quantity": {
      if (typeof v.amount !== "number" || !Number.isFinite(v.amount)) {
        return reject("value.amount must be a finite number");
      }
      const unit = asNonEmptyString(v.unit, "value.unit");
      if (!unit.ok) return unit;
      return {
        ok: true,
        value: { kind: "quantity", amount: v.amount, unit: unit.value },
      };
    }
    case "flag": {
      if (typeof v.flag !== "boolean") {
        return reject("value.flag must be a boolean");
      }
      return { ok: true, value: { kind: "flag", flag: v.flag } };
    }
    default:
      return reject(
        'value.kind must be "text", "instant", "reference", "quantity", or "flag"',
      );
  }
}

function parseProvenance(
  value: unknown,
):
  | { ok: true; value: Provenance }
  | { ok: false; response: Extract<CairnResponse, { kind: "rejected" }> } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return reject("provenance must be an object");
  }
  const p = value as Record<string, unknown>;
  const session = asNonEmptyString(p.session, "provenance.session");
  if (!session.ok) return session;
  const sessionId: SessionId = asSessionId(session.value);

  switch (p.kind) {
    case "told": {
      const by = asNonEmptyString(p.by, "provenance.by");
      if (!by.ok) return by;
      return {
        ok: true,
        value: { kind: "told", by: by.value, session: sessionId },
      };
    }
    case "observed": {
      const command = asNonEmptyString(p.command, "provenance.command");
      if (!command.ok) return command;
      return {
        ok: true,
        value: {
          kind: "observed",
          command: command.value,
          session: sessionId,
        },
      };
    }
    case "inferred": {
      if (!Array.isArray(p.from) || p.from.length === 0) {
        return reject("provenance.from must be a non-empty array of fact ids");
      }
      const from: FactId[] = [];
      for (const id of p.from) {
        if (typeof id !== "string" || id.trim() === "") {
          return reject("provenance.from must contain non-empty strings");
        }
        from.push(asFactId(id));
      }
      return {
        ok: true,
        value: { kind: "inferred", from, session: sessionId },
      };
    }
    default:
      return reject(
        'provenance.kind must be "told", "observed", or "inferred"',
      );
  }
}

function parseValidity(
  value: unknown,
):
  | { ok: true; value: Validity }
  | { ok: false; response: Extract<CairnResponse, { kind: "rejected" }> } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return reject("validity must be an object");
  }
  const v = value as Record<string, unknown>;
  switch (v.kind) {
    case "until-superseded":
      return { ok: true, value: { kind: "until-superseded" } };
    case "reverify": {
      const command = asNonEmptyString(v.command, "validity.command");
      if (!command.ok) return command;
      if (
        typeof v.staleAfterSeconds !== "number" ||
        !Number.isFinite(v.staleAfterSeconds) ||
        v.staleAfterSeconds < 0
      ) {
        return reject("validity.staleAfterSeconds must be a non-negative number");
      }
      return {
        ok: true,
        value: {
          kind: "reverify",
          command: command.value,
          staleAfterSeconds: v.staleAfterSeconds,
        },
      };
    }
    case "expires": {
      const at = asNonEmptyString(v.at, "validity.at");
      if (!at.ok) return at;
      return { ok: true, value: { kind: "expires", at: at.value } };
    }
    default:
      return reject(
        'validity.kind must be "until-superseded", "reverify", or "expires"',
      );
  }
}

function asNonEmptyString(
  value: unknown,
  field: string,
):
  | { ok: true; value: string }
  | { ok: false; response: Extract<CairnResponse, { kind: "rejected" }> } {
  if (typeof value !== "string" || value.trim() === "") {
    return reject(`${field} must be a non-empty string`);
  }
  return { ok: true, value };
}

function reject(
  message: string,
): { ok: false; response: Extract<CairnResponse, { kind: "rejected" }> } {
  return {
    ok: false,
    response: {
      kind: "rejected",
      error: {
        code: "invalid-request",
        message,
        remedy: { kind: "fix-request" },
      },
    },
  };
}
