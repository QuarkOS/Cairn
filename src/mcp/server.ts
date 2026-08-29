import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { parseCairnRequest } from "../lib/cairn/parse";
import type { CairnResponse } from "../lib/cairn/model";
import { handleRequest } from "../lib/cairn/store";

const NON_EMPTY_STRING = z.string().min(1);

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

const VALUE = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: NON_EMPTY_STRING }).strict(),
  z.object({ kind: z.literal("instant"), at: NON_EMPTY_STRING }).strict(),
  z.object({ kind: z.literal("reference"), entity: NON_EMPTY_STRING }).strict(),
  z
    .object({
      kind: z.literal("quantity"),
      amount: z.number().finite(),
      unit: NON_EMPTY_STRING,
    })
    .strict(),
  z.object({ kind: z.literal("flag"), flag: z.boolean() }).strict(),
]);

const PROVENANCE = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("told"),
      by: NON_EMPTY_STRING,
      session: NON_EMPTY_STRING,
    })
    .strict(),
  z
    .object({
      kind: z.literal("observed"),
      command: NON_EMPTY_STRING,
      session: NON_EMPTY_STRING,
    })
    .strict(),
  z
    .object({
      kind: z.literal("inferred"),
      from: z.array(NON_EMPTY_STRING).min(1),
      session: NON_EMPTY_STRING,
    })
    .strict(),
]);

const VALIDITY = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("until-superseded") }).strict(),
  z
    .object({
      kind: z.literal("reverify"),
      command: NON_EMPTY_STRING,
      staleAfterSeconds: z.number().finite().nonnegative(),
    })
    .strict(),
  z.object({ kind: z.literal("expires"), at: NON_EMPTY_STRING }).strict(),
]);

const ASSERT_DRAFT = z
  .object({
    entity: NON_EMPTY_STRING.describe("Stable entity identifier"),
    attribute: NON_EMPTY_STRING.describe("Typed attribute identifier"),
    value: VALUE,
    provenance: PROVENANCE,
    validity: VALIDITY,
  })
  .strict();

const SERVER_INSTRUCTIONS = [
  "Use cairn_recall at the start of a task or session before relying on persisted project facts.",
  "Prefer an exact, entity, or attribute query; use all only for orientation.",
  "Use cairn_assert and cairn_retract for writes; cairn_request remains only for compatibility with older clients.",
  "Every write needs an idempotency key; reuse a key only when replaying the exact same write.",
  "Respect each belief's freshness and assurance before asserting or retracting.",
].join(" ");

function toolResult(response: CairnResponse) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
    isError: response.kind === "rejected",
  };
}

async function handleToolRequest(request: unknown) {
  const parsed = parseCairnRequest(request);
  if (!parsed.ok) {
    return toolResult(parsed.response);
  }
  const response = await handleRequest(parsed.request);
  return toolResult(response);
}

export function createMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "cairn",
      version: "0.4.5",
    },
    { instructions: SERVER_INSTRUCTIONS },
  );

  server.registerTool(
    "cairn_recall",
    {
      title: "Recall Cairn beliefs",
      description:
        "Recall live beliefs from Cairn. Use this at task/session start before relying on persisted project facts.",
      inputSchema: {
        query: RECALL_QUERY,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ query }) => handleToolRequest({ kind: "recall", query }),
  );

  server.registerTool(
    "cairn_assert",
    {
      title: "Assert a Cairn fact",
      description:
        'Append an immutable typed fact. Use onConflict "fail" unless you intentionally mean to supersede the current live belief.',
      inputSchema: {
        idempotencyKey: NON_EMPTY_STRING.describe(
          "Unique key for this write; reuse only to replay the exact same assertion",
        ),
        onConflict: z
          .enum(["fail", "supersede"])
          .describe("How to handle an existing live entity/attribute belief"),
        draft: ASSERT_DRAFT,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ idempotencyKey, onConflict, draft }) =>
      handleToolRequest({
        kind: "assert",
        idempotencyKey,
        onConflict,
        draft,
      }),
  );

  server.registerTool(
    "cairn_retract",
    {
      title: "Retract a Cairn fact",
      description:
        "Retract a live fact without deleting history. Recall first to choose the current live fact id.",
      inputSchema: {
        idempotencyKey: NON_EMPTY_STRING.describe(
          "Unique key for this write; reuse only to replay the exact same retraction",
        ),
        factId: NON_EMPTY_STRING.describe("Live fact id returned by recall"),
        reason: NON_EMPTY_STRING.describe("Why this fact is being retracted"),
        session: NON_EMPTY_STRING.describe("Agent or task session identifier"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ idempotencyKey, factId, reason, session }) =>
      handleToolRequest({
        kind: "retract",
        idempotencyKey,
        factId,
        reason,
        session,
      }),
  );

  server.registerTool(
    "cairn_request",
    {
      title: "Send a Cairn compatibility request",
      description:
        "Compatibility tool for the Cairn JSON contract. Prefer cairn_recall, cairn_assert, or cairn_retract so clients can validate the full input schema.",
      inputSchema: {
        request: z.record(z.string(), z.unknown()),
      },
      annotations: {
        openWorldHint: false,
      },
    },
    async ({ request }) => handleToolRequest(request),
  );

  return server;
}

export async function startMcpServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
