import { resetStore } from "@/lib/cairn/store";

export const dynamic = "force-dynamic";

export async function POST() {
  const response = await resetStore();
  return Response.json(response);
}
