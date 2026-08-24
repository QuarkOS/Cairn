export type CanvasPod = { x: number; y: number };

export type CanvasLayout = {
  version: 1;
  pods: Record<string, CanvasPod>;
};

export function emptyCanvas(): CanvasLayout {
  return { version: 1, pods: {} };
}

export function isCanvasLayout(value: unknown): value is CanvasLayout {
  if (typeof value !== "object" || value === null) return false;
  if (!("version" in value) || !("pods" in value)) return false;
  if (value.version !== 1) return false;
  if (typeof value.pods !== "object" || value.pods === null) return false;
  for (const pod of Object.values(value.pods as Record<string, unknown>)) {
    if (typeof pod !== "object" || pod === null) return false;
    if (!("x" in pod) || !("y" in pod)) return false;
    if (typeof pod.x !== "number" || typeof pod.y !== "number") return false;
  }
  return true;
}
