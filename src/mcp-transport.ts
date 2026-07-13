export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
};

export type JsonRpcNotification = {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
};

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification;

export function encodeMcpMessage(message: unknown): Buffer {
  const body = JSON.stringify(message);
  const header = `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n`;
  return Buffer.concat([
    Buffer.from(header, "utf8"),
    Buffer.from(body, "utf8"),
  ]);
}

export function parseMcpFrames(buffer: Buffer): {
  messages: JsonRpcMessage[];
  rest: Buffer;
} {
  const messages: JsonRpcMessage[] = [];
  let rest = buffer;

  while (rest.length > 0) {
    const headerEnd = rest.indexOf("\r\n\r\n");
    if (headerEnd === -1) break;

    const header = rest.subarray(0, headerEnd).toString("utf8");
    const match = /Content-Length:\s*(\d+)/i.exec(header);
    if (!match) {
      throw new Error("Invalid MCP frame: missing Content-Length");
    }

    const length = Number.parseInt(match[1]!, 10);
    const bodyStart = headerEnd + 4;
    if (rest.length < bodyStart + length) break;

    const body = rest.subarray(bodyStart, bodyStart + length).toString("utf8");
    messages.push(JSON.parse(body) as JsonRpcMessage);
    rest = rest.subarray(bodyStart + length);
  }

  return { messages, rest };
}

export function isJsonRpcRequest(
  message: JsonRpcMessage,
): message is JsonRpcRequest {
  return "id" in message && message.id !== undefined;
}
