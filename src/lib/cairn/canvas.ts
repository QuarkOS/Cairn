import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";

import {
  emptyCanvas,
  isCanvasLayout,
  type CanvasLayout,
  type CanvasPod,
} from "./canvas-layout";

export type { CanvasLayout, CanvasPod };
export { emptyCanvas, isCanvasLayout };

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
