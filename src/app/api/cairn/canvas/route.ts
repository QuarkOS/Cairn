import { loadCanvas, saveCanvas } from "@/lib/cairn/canvas";
import { emptyCanvas, isCanvasLayout } from "@/lib/cairn/canvas-layout";
import { resolveCairnPaths } from "@/lib/cairn/paths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const { canvasPath } = resolveCairnPaths();
    return Response.json(loadCanvas(canvasPath));
  } catch {
    return Response.json(emptyCanvas());
  }
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

  try {
    const { canvasPath } = resolveCairnPaths();
    saveCanvas(canvasPath, body);
    return Response.json(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save canvas";
    return Response.json({ error: message }, { status: 500 });
  }
}
