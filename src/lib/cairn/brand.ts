export type FactId = string & { readonly __brand: "FactId" };
export type SessionId = string & { readonly __brand: "SessionId" };
export type EntityId = string & { readonly __brand: "EntityId" };
export type AttributeId = string & { readonly __brand: "AttributeId" };

export function asFactId(id: string): FactId {
  return id as FactId;
}

export function asSessionId(id: string): SessionId {
  return id as SessionId;
}

export function asEntityId(id: string): EntityId {
  return id as EntityId;
}

export function asAttributeId(id: string): AttributeId {
  return id as AttributeId;
}
