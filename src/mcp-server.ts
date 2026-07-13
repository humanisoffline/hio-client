#!/usr/bin/env node

import { createHioClient } from "./index.js";
import { callMcpTool, handleMcpMethod } from "./mcp-tools.js";
import {
  encodeMcpMessage,
  isJsonRpcRequest,
  parseMcpFrames,
  type JsonRpcMessage,
  type JsonRpcRequest,
} from "./mcp-transport.js";

const baseUrl = process.env.HIO_BASE_URL ?? "https://humanisoffline.com";
const client = createHioClient({ baseUrl });

function writeMessage(message: unknown) {
  process.stdout.write(encodeMcpMessage(message));
}

async function handleRequest(request: JsonRpcRequest): Promise<unknown> {
  if (request.method === "tools/call") {
    const params = request.params as {
      name: string;
      arguments?: Record<string, unknown>;
    };
    try {
      return await callMcpTool(client, params.name, params.arguments ?? {});
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: error instanceof Error ? error.message : "MCP tool error",
          },
        ],
        isError: true,
      };
    }
  }

  return handleMcpMethod(request.method, request.params);
}

async function dispatch(message: JsonRpcMessage) {
  if (!isJsonRpcRequest(message)) {
    return;
  }

  try {
    const result = await handleRequest(message);
    writeMessage({
      jsonrpc: "2.0",
      id: message.id,
      result,
    });
  } catch (error) {
    writeMessage({
      jsonrpc: "2.0",
      id: message.id,
      error: {
        code: -32000,
        message: error instanceof Error ? error.message : "MCP error",
      },
    });
  }
}

async function main() {
  let buffer: Buffer = Buffer.alloc(0);

  process.stdin.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]) as Buffer;
    try {
      const parsed = parseMcpFrames(buffer);
      buffer = parsed.rest;
      for (const message of parsed.messages) {
        void dispatch(message);
      }
    } catch (error) {
      process.stderr.write(
        `${error instanceof Error ? error.message : "MCP parse error"}\n`,
      );
      process.exit(1);
    }
  });
}

void main();
