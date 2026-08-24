import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "./server";

describe("MCP server contract", () => {
  const roots: string[] = [];

  after(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  it("publishes recall guidance and reports rejected requests as errors", async () => {
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
      assert.ok(recall);
      assert.match(recall.description ?? "", /task\/session start/i);
      const schema = JSON.stringify(recall.inputSchema);
      assert.match(schema, /entity/);
      assert.match(schema, /attribute/);
      assert.match(schema, /oneOf|anyOf/);
      assert.match(client.getInstructions() ?? "", /cairn_recall/);

      const baseRequest = {
        kind: "assert",
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
        name: "cairn_request",
        arguments: { request: { ...baseRequest, idempotencyKey: "first" } },
      });
      const rejected = await client.callTool({
        name: "cairn_request",
        arguments: { request: { ...baseRequest, idempotencyKey: "second" } },
      });
      assert.notEqual(first.isError, true);
      assert.equal(rejected.isError, true);
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
