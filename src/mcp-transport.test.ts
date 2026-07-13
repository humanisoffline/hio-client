import { describe, expect, it, vi } from "vitest";
import {
  encodeMcpMessage,
  parseMcpFrames,
  type JsonRpcRequest,
} from "./mcp-transport.js";

describe("mcp-transport", () => {
  it("round-trips framed JSON-RPC messages", () => {
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test", version: "0.0.0" },
      },
    };

    const frame = encodeMcpMessage(request);
    const parsed = parseMcpFrames(frame);

    expect(parsed.rest.length).toBe(0);
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0]).toEqual(request);
  });

  it("buffers partial frames until complete", () => {
    const frame = encodeMcpMessage({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    });

    const split = Math.floor(frame.length / 2);
    const first = parseMcpFrames(frame.subarray(0, split));
    expect(first.messages).toHaveLength(0);
    expect(first.rest.length).toBe(split);

    const second = parseMcpFrames(
      Buffer.concat([first.rest, frame.subarray(split)]),
    );
    expect(second.messages).toHaveLength(1);
    expect(second.messages[0]).toMatchObject({ method: "tools/list" });
  });
});
