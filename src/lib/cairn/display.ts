import type { Belief, Value } from "@/lib/cairn/model";

export type RecalledResponse = {
  kind: "recalled";
  beliefs: Belief[];
  recalledAt: string;
};

export function formatValue(value: Value): string {
  switch (value.kind) {
    case "text":
      return value.text;
    case "instant":
      return value.at;
    case "reference":
      return value.entity;
    case "quantity":
      return `${value.amount} ${value.unit}`;
    case "flag":
      return value.flag ? "true" : "false";
  }
}

export function provenanceText(belief: Belief): string {
  const p = belief.current.provenance;
  switch (p.kind) {
    case "told":
      return `told by ${p.by} session ${p.session}`;
    case "observed":
      return `observed ${p.command} session ${p.session}`;
    case "inferred":
      return `inferred from ${p.from.join(" ")} session ${p.session}`;
  }
}

export function beliefMatchesSearch(belief: Belief, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    belief.current.entity,
    belief.current.attribute,
    formatValue(belief.current.value),
    provenanceText(belief),
    belief.freshness,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function podKeyForBelief(belief: Belief): string {
  const p = belief.current.provenance;
  if (p.kind === "told") return p.by;
  return `session:${p.session}`;
}
