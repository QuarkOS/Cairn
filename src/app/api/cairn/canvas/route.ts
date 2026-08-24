import { loadCanvas, saveCanvas, type CanvasLayout } from "@/lib/cairn/canvas";
import { resolveCairnPaths } from "@/lib/cairn/paths";

export const dynamic = "force-dynamic";

export async function GET() {
  const { canvasPath } = resolveCairnPaths();
  const layout = loadCanvas(canvasPath);
  return Response.json(layout);
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  if (!isCanvasLayout(body)) {
    return Response.json(
      {
        error:
          "Layout must be { version: 1, pods: Record<string, { x: number, y: number }> }",
      },
      { status: 400 },
    );
  }

  const { canvasPath } = resolveCairnPaths();
  saveCanvas(canvasPath, body);
  return Response.json(body);
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
