import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { parseCairnRequest } from "../lib/cairn/parse";
import type { CairnResponse } from "../lib/cairn/model";
import { handleRequest } from "../lib/cairn/store";

const RECALL_QUERY = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("all") }).strict(),
  z.object({ kind: z.literal("entity"), entity: z.string().min(1) }).strict(),
  z
    .object({ kind: z.literal("attribute"), attribute: z.string().min(1) })
    .strict(),
  z
    .object({
      kind: z.literal("exact"),
      entity: z.string().min(1),
      attribute: z.string().min(1),
    })
    .strict(),
]);

const SERVER_INSTRUCTIONS = [
  "Use cairn_recall at the start of a task or session before relying on persisted project facts.",
  "Prefer an exact, entity, or attribute query; use all only for orientation.",
  "Respect each belief's freshness and assurance before asserting or retracting.",
].join(" ");

function toolResult(response: CairnResponse) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
    isError: response.kind === "rejected",
  };
}

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "cairn",
    version: "0.4.2",
  }, { instructions: SERVER_INSTRUCTIONS });

  server.tool(
    "cairn_recall",
    "Recall live beliefs from Cairn. Use this at task/session start before relying on persisted project facts.",
    {
      query: RECALL_QUERY,
    },
    async ({ query }) => {
      const parsed = parseCairnRequest({ kind: "recall", query });
      if (!parsed.ok) {
        return toolResult(parsed.response);
      }
      const response = await handleRequest(parsed.request);
      return toolResult(response);
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
        return toolResult(parsed.response);
      }
      const response = await handleRequest(parsed.request);
      return toolResult(response);
    },
  );

  return server;
}

export async function startMcpServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
