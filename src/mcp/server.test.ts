import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "./server";

function responseJson(result: unknown): Record<string, unknown> {
  assert.ok(typeof result === "object" && result !== null);
  const content = (result as { content?: unknown }).content;
  assert.ok(Array.isArray(content));
  const text = content.find(
    (item): item is { type: "text"; text: string } =>
      typeof item === "object" &&
      item !== null &&
      (item as { type?: unknown }).type === "text" &&
      typeof (item as { text?: unknown }).text === "string",
  );
  assert.ok(text);
  return JSON.parse(text.text) as Record<string, unknown>;
}

describe("MCP server contract", () => {
  const roots: string[] = [];

  after(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  it("publishes typed tools and executes assert/recall/retract", async () => {
    const root = mkdtempSync(join(tmpdir(), "cairn-mcp-"));
    roots.push(root);
    const previousHome = process.env.CAIRN_HOME;
    const previousDbPath = process.env.CAIRN_DB_PATH;
    process.env.CAIRN_HOME = join(root, ".cairn");
    delete process.env.CAIRN_DB_PATH;

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const server = createMcpServer();
    const client = new Client({ name: "cairn-test-client", version: "1.0.0" });
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);

      const listed = await client.listTools();
      const recall = listed.tools.find((tool) => tool.name === "cairn_recall");
      const assertFact = listed.tools.find(
        (tool) => tool.name === "cairn_assert",
      );
      const retract = listed.tools.find(
        (tool) => tool.name === "cairn_retract",
      );
      const compatibility = listed.tools.find(
        (tool) => tool.name === "cairn_request",
      );
      assert.ok(recall);
      assert.ok(assertFact);
      assert.ok(retract);
      assert.ok(compatibility);
      assert.match(recall.description ?? "", /task\/session start/i);
      const recallSchema = JSON.stringify(recall.inputSchema);
      assert.match(recallSchema, /entity/);
      assert.match(recallSchema, /attribute/);
      assert.match(recallSchema, /oneOf|anyOf/);
      const assertSchema = JSON.stringify(assertFact.inputSchema);
      assert.match(assertSchema, /idempotencyKey/);
      assert.match(assertSchema, /onConflict/);
      assert.match(assertSchema, /provenance/);
      assert.match(assertSchema, /staleAfterSeconds/);
      const retractSchema = JSON.stringify(retract.inputSchema);
      assert.match(retractSchema, /factId/);
      assert.match(retractSchema, /reason/);
      assert.equal(recall.annotations?.readOnlyHint, true);
      assert.equal(assertFact.annotations?.idempotentHint, true);
      assert.equal(assertFact.annotations?.destructiveHint, false);
      assert.equal(retract.annotations?.idempotentHint, true);
      assert.equal(retract.annotations?.destructiveHint, true);
      assert.match(client.getInstructions() ?? "", /cairn_recall/);
      assert.match(client.getInstructions() ?? "", /cairn_assert/);
      assert.match(client.getInstructions() ?? "", /cairn_retract/);

      const assertion = {
        idempotencyKey: "first",
        onConflict: "fail",
        draft: {
          entity: "mcp:test",
          attribute: "same",
          value: { kind: "text", text: "one" },
          provenance: { kind: "told", by: "mcp-test", session: "mcp" },
          validity: { kind: "until-superseded" },
        },
      };
      const first = await client.callTool({
        name: "cairn_assert",
        arguments: assertion,
      });
      assert.notEqual(first.isError, true);
      const firstResponse = responseJson(first);
      assert.equal(firstResponse.kind, "asserted");
      const factId = (firstResponse.fact as { id?: unknown } | undefined)?.id;
      assert.ok(typeof factId === "string");

      const replay = await client.callTool({
        name: "cairn_assert",
        arguments: assertion,
      });
      assert.notEqual(replay.isError, true);
      assert.deepEqual(responseJson(replay), firstResponse);

      const rejected = await client.callTool({
        name: "cairn_assert",
        arguments: { ...assertion, idempotencyKey: "second" },
      });
      assert.equal(rejected.isError, true);
      assert.equal(responseJson(rejected).kind, "rejected");

      const recalled = await client.callTool({
        name: "cairn_recall",
        arguments: {
          query: {
            kind: "exact",
            entity: "mcp:test",
            attribute: "same",
          },
        },
      });
      const recalledResponse = responseJson(recalled);
      assert.equal(recalledResponse.kind, "recalled");
      assert.ok(Array.isArray(recalledResponse.beliefs));
      assert.equal(recalledResponse.beliefs.length, 1);

      const retracted = await client.callTool({
        name: "cairn_retract",
        arguments: {
          idempotencyKey: "retract-first",
          factId,
          reason: "MCP lifecycle test",
          session: "mcp",
        },
      });
      assert.notEqual(retracted.isError, true);
      assert.equal(responseJson(retracted).kind, "retracted");

      const after = await client.callTool({
        name: "cairn_recall",
        arguments: {
          query: {
            kind: "exact",
            entity: "mcp:test",
            attribute: "same",
          },
        },
      });
      const afterResponse = responseJson(after);
      assert.ok(Array.isArray(afterResponse.beliefs));
      assert.equal(afterResponse.beliefs.length, 0);

      const compatibleRecall = await client.callTool({
        name: "cairn_request",
        arguments: {
          request: { kind: "recall", query: { kind: "all" } },
        },
      });
      assert.notEqual(compatibleRecall.isError, true);
      assert.equal(responseJson(compatibleRecall).kind, "recalled");
    } finally {
      await client.close();
      await server.close();
      if (previousHome === undefined) delete process.env.CAIRN_HOME;
      else process.env.CAIRN_HOME = previousHome;
      if (previousDbPath === undefined) delete process.env.CAIRN_DB_PATH;
      else process.env.CAIRN_DB_PATH = previousDbPath;
    }
  });
});
