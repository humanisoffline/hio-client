import { describe, expect, it } from "vitest";
import { HioClientError, assertOkResponse } from "./errors.js";

describe("HioClientError", () => {
  it("captures the HTTP status on failed responses", async () => {
    await expect(
      assertOkResponse(
        "fetchCardJson",
        new Response("missing", { status: 404 }),
      ),
    ).rejects.toMatchObject({
      name: "HioClientError",
      status: 404,
      message: "fetchCardJson failed: 404",
    });
  });

  it("does not throw for successful responses", async () => {
    await expect(
      assertOkResponse("fetchCardJson", new Response("{}", { status: 200 })),
    ).resolves.toBeUndefined();
  });

  it("exposes status on the error instance", () => {
    const error = new HioClientError("resolveCard", 404);
    expect(error.status).toBe(404);
  });
});
