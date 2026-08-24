import { handleRequest } from "@/lib/cairn/store";
import { parseCairnRequest } from "@/lib/cairn/parse";

export const dynamic = "force-dynamic";

export async function GET() {
  const response = await handleRequest({ kind: "recall", query: { kind: "all" } });
  return Response.json(response);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      {
        kind: "rejected",
        error: {
          code: "invalid-request",
          message: "Request body must be valid JSON",
          remedy: { kind: "fix-request" },
        },
      },
      { status: 400 },
    );
  }

  const parsed = parseCairnRequest(body);
  if (!parsed.ok) {
    return Response.json(parsed.response, { status: 400 });
  }

  const response = await handleRequest(parsed.request);
  return Response.json(response);
}
