import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { loadCanvas, saveCanvas } from "./canvas";
import { emptyCanvas, isCanvasLayout } from "./canvas-layout";

describe("canvas layout", () => {
  const root = mkdtempSync(join(tmpdir(), "cairn-canvas-"));
  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns an empty layout when the file is missing", () => {
    assert.deepEqual(loadCanvas(join(root, "missing.json")), emptyCanvas());
  });

  it("round-trips a valid layout", () => {
    const path = join(root, "canvas.json");
    const layout = {
      version: 1 as const,
      pods: { "session:s-015": { x: 120, y: 80 } },
    };
    assert.equal(isCanvasLayout(layout), true);
    saveCanvas(path, layout);
    assert.deepEqual(loadCanvas(path), layout);
    const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(isCanvasLayout(raw), true);
  });

  it("rejects a malformed layout", () => {
    assert.equal(isCanvasLayout({ version: 2, pods: {} }), false);
    assert.equal(isCanvasLayout({ version: 1, pods: { a: { x: "1", y: 0 } } }), false);
  });
});
