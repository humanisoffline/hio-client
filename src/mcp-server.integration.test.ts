import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer, type Server } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import nacl from "tweetnacl";
import { bytesToBase64Url } from "./crypto.js";
import {
  encodeMcpMessage,
  parseMcpFrames,
  type JsonRpcMessage,
} from "./mcp-transport.js";
import { HIO_PROTOCOL_VERSION } from "./types.js";

const serverPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "dist",
  "mcp-server.js",
);

const keyPair = nacl.box.keyPair();
const publicKey = bytesToBase64Url(keyPair.publicKey);

const cardJson = {
  schemaVersion: HIO_PROTOCOL_VERSION,
  card: {
    slug: "example",
    updatedAt: "2026-07-12T12:00:00.000Z",
    requestPolicy: {
      acceptsRequests: true,
      endpoint: "http://127.0.0.1:0/api/cards/example/requests",
      encryption: "required" as const,
      publicKeyId: "pk_test",
      publicEncryptionKey: publicKey,
    },
  },
};

type MockServer = {
  baseUrl: string;
  close: () => Promise<void>;
};

async function startMockHioServer(): Promise<MockServer> {
  let requestEndpoint = "";
  const server: Server = createServer((req, res) => {
    const url = req.url ?? "";
    if (url === "/c/example.md") {
      res.writeHead(200, { "content-type": "text/markdown; charset=utf-8" });
      res.end("# Example card\n");
      return;
    }
    if (url === "/c/example.json") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          ...cardJson,
          card: {
            ...cardJson.card,
            requestPolicy: {
              ...cardJson.card.requestPolicy,
              endpoint: `${requestEndpoint}/api/cards/example/requests`,
            },
          },
        }),
      );
      return;
    }
    if (url === "/api/cards/example/requests" && req.method === "POST") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          accepted: true,
          receivedAt: "2026-07-12T12:00:00.000Z",
          receiptUrl: `${requestEndpoint}/receipts/r_int/json`,
          receiptId: "r_int",
        }),
      );
      return;
    }
    if (url === "/receipts/r_int/json") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          schema:
            "https://humanisoffline.com/schemas/delegation-receipt.v3.json",
          schemaVersion: HIO_PROTOCOL_VERSION,
          receipt: {
            id: "r_int",
            kind: "ask_first_inbox_note",
            createdAt: "2026-07-12T12:00:00.000Z",
          },
          card: {
            slug: "example",
            schemaVersion: HIO_PROTOCOL_VERSION,
            updatedAt: "2026-07-12T12:00:00.000Z",
          },
          hashes: {
            payloadHash: "a".repeat(64),
            recordHash: "b".repeat(64),
          },
          anchor: { status: "pending" },
        }),
      );
      return;
    }
    if (url === "/api/cards/resolve" && req.method === "POST") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          slug: "example",
          cardUrl: `${requestEndpoint}/c/example`,
          cardJson: `${requestEndpoint}/c/example.json`,
          cardMarkdown: `${requestEndpoint}/c/example.md`,
        }),
      );
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind mock Human Is Offline server");
  }
  requestEndpoint = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl: requestEndpoint,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

class McpSubprocessClient {
  private proc: ChildProcessWithoutNullStreams;
  private buffer = Buffer.alloc(0);
  private pending = new Map<
    number | string,
    {
      resolve: (value: JsonRpcMessage & { id: number | string }) => void;
      reject: (error: Error) => void;
    }
  >();
  private nextId = 1;

  private constructor(proc: ChildProcessWithoutNullStreams) {
    this.proc = proc;
    proc.stdout.on("data", (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      const parsed = parseMcpFrames(this.buffer);
      this.buffer = parsed.rest;
      for (const message of parsed.messages) {
        if (message.id === undefined) continue;
        const waiter = this.pending.get(message.id);
        if (!waiter) continue;
        this.pending.delete(message.id);
        if ("error" in message && message.error) {
          waiter.reject(new Error(message.error.message));
        } else {
          waiter.resolve(message as JsonRpcMessage & { id: number | string });
        }
      }
    });
  }

  static async spawn(baseUrl: string): Promise<McpSubprocessClient> {
    const proc = spawn(process.execPath, [serverPath], {
      env: { ...process.env, HIO_BASE_URL: baseUrl },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const client = new McpSubprocessClient(proc);
    await client.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "integration", version: "0.0.0" },
    });
    client.notify("notifications/initialized", {});
    return client;
  }

  notify(method: string, params?: Record<string, unknown>) {
    this.proc.stdin.write(encodeMcpMessage({ jsonrpc: "2.0", method, params }));
  }

  request(method: string, params?: Record<string, unknown>) {
    const id = this.nextId++;
    return new Promise<JsonRpcMessage & { id: number | string }>(
      (resolve, reject) => {
        this.pending.set(id, { resolve, reject });
        this.proc.stdin.write(
          encodeMcpMessage({ jsonrpc: "2.0", id, method, params }),
        );
      },
    );
  }

  async callTool(name: string, args: Record<string, unknown>) {
    const response = await this.request("tools/call", {
      name,
      arguments: args,
    });
    return response.result as {
      content: Array<{ type: "text"; text: string }>;
      isError?: boolean;
    };
  }

  close() {
    this.proc.kill();
  }
}

describe("mcp-server subprocess", () => {
  let mockServer: MockServer | undefined;
  let mcp: McpSubprocessClient | undefined;

  afterEach(async () => {
    mcp?.close();
    mcp = undefined;
    await mockServer?.close();
    mockServer = undefined;
  });

  it("runs the canonical agent loop over stdio against a mock server", async () => {
    mockServer = await startMockHioServer();
    mcp = await McpSubprocessClient.spawn(mockServer.baseUrl);

    const markdown = await mcp.callTool("fetch_card_markdown", {
      url: `${mockServer.baseUrl}/c/example.md`,
    });
    expect(markdown.isError, markdown.content[0]?.text).not.toBe(true);
    expect(markdown.content[0]!.text).toContain("Example card");

    const resolved = await mcp.callTool("resolve_card", {
      type: "domain",
      identifier: "example.com",
    });
    expect(resolved.isError, resolved.content[0]?.text).not.toBe(true);
    expect(JSON.parse(resolved.content[0]!.text).slug).toBe("example");

    const submit = await mcp.callTool("submit_ask_first_note", {
      cardJsonUrl: `${mockServer.baseUrl}/c/example.json`,
      plaintext: {
        schemaVersion: HIO_PROTOCOL_VERSION,
        type: "inform",
        title: "Need approval",
        summary: "Deploy staging",
        urgency: "normal",
        riskLevel: "medium",
      },
    });
    expect(submit.isError, submit.content[0]?.text).not.toBe(true);
    const submitBody = JSON.parse(submit.content[0]!.text) as {
      receiptId: string;
      receiptUrl: string;
    };
    expect(submitBody.receiptId).toBe("r_int");

    const receipt = await mcp.callTool("get_receipt", {
      receiptUrl: submitBody.receiptUrl,
    });
    expect(receipt.isError, receipt.content[0]?.text).not.toBe(true);
    expect(JSON.parse(receipt.content[0]!.text).receipt.id).toBe("r_int");
  });
});
