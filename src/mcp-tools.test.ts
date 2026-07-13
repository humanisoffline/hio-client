import { describe, expect, it, vi } from "vitest";
import nacl from "tweetnacl";
import { bytesToBase64Url } from "./crypto.js";
import { createHioClient } from "./index.js";
import { callMcpTool, handleMcpMethod, MCP_TOOLS } from "./mcp-tools.js";
import { HIO_PROTOCOL_VERSION } from "./types.js";

const testKeyPair = nacl.box.keyPair();
const testPublicKey = bytesToBase64Url(testKeyPair.publicKey);

function mockFetch(
  handlers: Record<
    string,
    (init?: RequestInit) => Response | Promise<Response>
  >,
): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    for (const [pattern, handler] of Object.entries(handlers)) {
      if (url.includes(pattern)) {
        return handler(init);
      }
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

const cardJson = {
  schemaVersion: HIO_PROTOCOL_VERSION,
  card: {
    slug: "example",
    updatedAt: "2026-07-12T12:00:00.000Z",
    requestPolicy: {
      acceptsRequests: true,
      endpoint: "https://humanisoffline.com/api/cards/example/requests",
      encryption: "required" as const,
      publicKeyId: "pk_test",
      publicEncryptionKey: testPublicKey,
    },
  },
};

describe("mcp-tools", () => {
  it("lists the canonical agent loop tools", () => {
    expect(MCP_TOOLS.map((tool) => tool.name)).toEqual([
      "resolve_card",
      "fetch_card_markdown",
      "fetch_card_json",
      "submit_ask_first_note",
      "get_receipt",
    ]);
  });

  it("fetch_card_json returns structured card JSON", async () => {
    const client = createHioClient({
      fetch: mockFetch({
        "/c/example.json": () => Response.json(cardJson),
      }),
    });

    const result = await callMcpTool(client, "fetch_card_json", {
      url: "https://humanisoffline.com/c/example.json",
    });

    expect(JSON.parse(result.content[0]!.text).card.slug).toBe("example");
  });

  it("submit_ask_first_note encrypts plaintext via card JSON", async () => {
    let postedBody: unknown;
    const client = createHioClient({
      fetch: mockFetch({
        "/c/example.json": () => Response.json(cardJson),
        "/api/cards/example/requests": (init) => {
          postedBody = JSON.parse(String(init?.body));
          return Response.json({
            accepted: true,
            receivedAt: "2026-07-12T12:00:00.000Z",
            receiptUrl: "https://humanisoffline.com/receipts/r_test/json",
            receiptId: "r_test",
          });
        },
      }),
    });

    const result = await callMcpTool(client, "submit_ask_first_note", {
      cardJsonUrl: "https://humanisoffline.com/c/example.json",
      plaintext: {
        schemaVersion: HIO_PROTOCOL_VERSION,
        type: "inform",
        title: "Need approval",
        summary: "Deploy staging after tests pass.",
        urgency: "normal",
        riskLevel: "medium",
      },
      interpretedBoundary: {
        outcome: "ask_first",
        summary: "Deploy staging",
      },
    });

    const body = JSON.parse(result.content[0]!.text) as { receiptId: string };
    expect(body.receiptId).toBe("r_test");
    expect(postedBody).toMatchObject({
      schemaVersion: HIO_PROTOCOL_VERSION,
      cardSlug: "example",
      encryption: { scheme: "sealed_box_v1" },
    });
    expect(
      (postedBody as { encryptedPayload: string }).encryptedPayload,
    ).toBeTruthy();
  });

  it("handleMcpMethod serves initialize and tools/list", () => {
    expect(handleMcpMethod("initialize")).toMatchObject({
      protocolVersion: "2024-11-05",
      serverInfo: { name: "hio-mcp" },
    });
    expect(handleMcpMethod("tools/list")).toEqual({ tools: MCP_TOOLS });
  });
});
