import { describe, expect, it, vi } from "vitest";
import nacl from "tweetnacl";
import { bytesToBase64Url } from "./crypto.js";
import { createHioClient, HioClientError } from "./index.js";
import { HIO_PROTOCOL_VERSION } from "./types.js";

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

describe("HioClient", () => {
  it("resolveCard returns structured URLs", async () => {
    const client = createHioClient({
      baseUrl: "https://humanisoffline.com",
      fetch: mockFetch({
        "/api/cards/resolve": () =>
          Response.json({
            slug: "example",
            cardUrl: "https://humanisoffline.com/c/example",
            cardJson: "https://humanisoffline.com/c/example.json",
            cardMarkdown: "https://humanisoffline.com/c/example.md",
          }),
      }),
    });

    const resolved = await client.resolveCard({
      type: "github",
      identifier: "octocat",
    });

    expect(resolved.slug).toBe("example");
    expect(resolved.cardMarkdown).toContain("/c/example.md");
  });

  it("fetchCardJson returns structured card data", async () => {
    const fetchImpl = mockFetch({
      "/c/example.json": () =>
        Response.json({
          schemaVersion: HIO_PROTOCOL_VERSION,
          card: {
            slug: "example",
            updatedAt: "2026-07-12T12:00:00.000Z",
            requestPolicy: {
              acceptsRequests: true,
              endpoint: "https://humanisoffline.com/api/cards/example/requests",
              encryption: "required",
              publicKeyId: "pk_test",
              publicEncryptionKey:
                "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            },
          },
        }),
    });
    const client = createHioClient({ fetch: fetchImpl });
    const card = await client.fetchCardJson(
      "https://humanisoffline.com/c/example.json",
    );
    expect(card.card.slug).toBe("example");
  });

  it("submitAskFirstNote posts the envelope", async () => {
    const envelope = {
      schemaVersion: HIO_PROTOCOL_VERSION,
      cardSlug: "example",
      encryptedPayload: "payload",
      encryption: { scheme: "sealed_box_v1" as const, nonce: "nonce" },
    };
    const fetchImpl = mockFetch({
      "/api/cards/example/requests": (init) => {
        expect(JSON.parse(String(init?.body))).toEqual(envelope);
        return Response.json({
          accepted: true,
          receivedAt: "2026-07-12T12:00:00.000Z",
          receiptUrl: "https://humanisoffline.com/receipts/r_test/json",
          receiptId: "r_test",
        });
      },
    });
    const client = createHioClient({ fetch: fetchImpl });
    const result = await client.submitAskFirstNote({
      cardSlug: "example",
      envelope,
    });
    expect(result.receiptId).toBe("r_test");
  });

  it("fetchCardMarkdown returns card text", async () => {
    const client = createHioClient({
      fetch: mockFetch({
        "/c/example.md": () => new Response("# Example card\n"),
      }),
    });

    const markdown = await client.fetchCardMarkdown(
      "https://humanisoffline.com/c/example.md",
    );
    expect(markdown).toContain("Example card");
  });

  it("getReceipt returns delegation receipt JSON", async () => {
    const receipt = {
      schema: "https://humanisoffline.com/schemas/delegation-receipt.v3.json",
      schemaVersion: HIO_PROTOCOL_VERSION,
      receipt: {
        id: "r_test",
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
    };
    const client = createHioClient({
      fetch: mockFetch({
        "/receipts/r_test/json": () => Response.json(receipt),
      }),
    });

    const result = await client.getReceipt(
      "https://humanisoffline.com/receipts/r_test/json",
    );
    expect(result.receipt.id).toBe("r_test");
  });

  it("submitAskFirstNotePlaintext builds a sealed envelope and posts it", async () => {
    const pair = nacl.box.keyPair();
    const publicKey = bytesToBase64Url(pair.publicKey);
    let postedBody: unknown;
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
          publicEncryptionKey: publicKey,
        },
      },
    };
    const client = createHioClient({
      fetch: mockFetch({
        "/api/cards/example/requests": (init) => {
          postedBody = JSON.parse(String(init?.body));
          return Response.json({
            accepted: true,
            receivedAt: "2026-07-12T12:00:00.000Z",
            receiptUrl: "https://humanisoffline.com/receipts/r_plain/json",
            receiptId: "r_plain",
          });
        },
      }),
    });

    const result = await client.submitAskFirstNotePlaintext({
      cardJson,
      plaintext: {
        schemaVersion: HIO_PROTOCOL_VERSION,
        type: "inform",
        title: "Need approval",
        summary: "Deploy staging",
        urgency: "normal",
        riskLevel: "medium",
      },
    });

    expect(result.receiptId).toBe("r_plain");
    expect(postedBody).toMatchObject({
      schemaVersion: HIO_PROTOCOL_VERSION,
      cardSlug: "example",
      encryption: { scheme: "sealed_box_v1" },
    });
  });

  it("throws HioClientError on HTTP failure", async () => {
    const client = createHioClient({
      fetch: mockFetch({
        "/api/cards/resolve": () => new Response("nope", { status: 404 }),
      }),
    });

    await expect(
      client.resolveCard({
        type: "url",
        identifier: "https://x.test/c/missing",
      }),
    ).rejects.toBeInstanceOf(HioClientError);
  });
});
