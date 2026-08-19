import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { parseCairnRequest } from "@/lib/cairn/parse";
import { handleRequest } from "@/lib/cairn/store";

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({
    name: "cairn",
    version: "0.3.0",
  });

  server.tool(
    "cairn_recall",
    "Recall live beliefs from Cairn.",
    {
      query: z.object({
        kind: z.enum(["all", "entity", "attribute", "exact"]),
        entity: z.string().optional(),
        attribute: z.string().optional(),
      }),
    },
    async ({ query }) => {
      const parsed = parseCairnRequest({ kind: "recall", query });
      if (!parsed.ok) {
        return {
          content: [{ type: "text", text: JSON.stringify(parsed.response, null, 2) }],
          isError: true,
        };
      }
      const response = await handleRequest(parsed.request);
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    },
  );

  server.tool(
    "cairn_request",
    "Send a Cairn request. Body must match the Cairn JSON contract.",
    {
      request: z.record(z.string(), z.unknown()),
    },
    async ({ request }) => {
      const parsed = parseCairnRequest(request);
      if (!parsed.ok) {
        return {
          content: [{ type: "text", text: JSON.stringify(parsed.response, null, 2) }],
          isError: true,
        };
      }
      const response = await handleRequest(parsed.request);
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
