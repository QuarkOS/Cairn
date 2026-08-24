import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";

export type CanvasPod = { x: number; y: number };

export type CanvasLayout = {
  version: 1;
  pods: Record<string, CanvasPod>;
};

export function emptyCanvas(): CanvasLayout {
  return { version: 1, pods: {} };
}

export function loadCanvas(canvasPath: string): CanvasLayout {
  if (!existsSync(canvasPath)) {
    return emptyCanvas();
  }
  try {
    const raw: unknown = JSON.parse(readFileSync(canvasPath, "utf8"));
    if (!isCanvasLayout(raw)) {
      return emptyCanvas();
    }
    return raw;
  } catch {
    return emptyCanvas();
  }
}

export function saveCanvas(canvasPath: string, layout: CanvasLayout): void {
  mkdirSync(dirname(canvasPath), { recursive: true });
  writeFileSync(canvasPath, `${JSON.stringify(layout, null, 2)}\n`, "utf8");
}

function isCanvasLayout(value: unknown): value is CanvasLayout {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record.version !== 1) return false;
  if (typeof record.pods !== "object" || record.pods === null) return false;
  for (const pod of Object.values(record.pods as Record<string, unknown>)) {
    if (typeof pod !== "object" || pod === null) return false;
    const p = pod as Record<string, unknown>;
    if (typeof p.x !== "number" || typeof p.y !== "number") return false;
  }
  return true;
}
