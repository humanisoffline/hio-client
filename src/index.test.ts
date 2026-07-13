import { describe, expect, it, vi } from "vitest";
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
