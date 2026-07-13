import type { HioClient } from "./index.js";
import type { AskFirstPlaintext, InterpretedBoundary } from "./types.js";

export const MCP_PROTOCOL_VERSION = "2024-11-05";

export const MCP_TOOLS = [
  {
    name: "resolve_card",
    description: "Resolve a card alias to canonical card URLs",
    inputSchema: {
      type: "object",
      properties: {
        type: { enum: ["domain", "github", "url"] },
        identifier: { type: "string" },
      },
      required: ["type", "identifier"],
    },
  },
  {
    name: "fetch_card_markdown",
    description: "Fetch a card Markdown document (read authority first)",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    },
  },
  {
    name: "fetch_card_json",
    description:
      "Fetch structured card JSON for exact fields and request encryption keys",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    },
  },
  {
    name: "submit_ask_first_note",
    description:
      "Leave one encrypted ask-first inbox note, then stop. Fetches card JSON, encrypts plaintext, submits.",
    inputSchema: {
      type: "object",
      properties: {
        cardJsonUrl: { type: "string" },
        plaintext: {
          type: "object",
          properties: {
            schemaVersion: { type: "integer", const: 3 },
            type: {
              enum: ["inform", "collect", "authorize", "escalate", "result"],
            },
            title: { type: "string" },
            summary: { type: "string" },
            urgency: { enum: ["low", "normal", "high", "critical"] },
            riskLevel: {
              enum: ["low", "medium", "high", "irreversible"],
            },
          },
          required: [
            "schemaVersion",
            "type",
            "title",
            "summary",
            "urgency",
            "riskLevel",
          ],
        },
        interpretedBoundary: {
          type: "object",
          properties: {
            outcome: {
              enum: ["allowed", "forbidden", "ask_first", "stop"],
            },
            sectionId: { type: "string" },
            riskLevel: {
              enum: ["low", "medium", "high", "irreversible"],
            },
            summary: { type: "string" },
          },
          required: ["outcome"],
        },
      },
      required: ["cardJsonUrl", "plaintext"],
    },
  },
  {
    name: "get_receipt",
    description: "Fetch public delegation receipt JSON",
    inputSchema: {
      type: "object",
      properties: { receiptUrl: { type: "string" } },
      required: ["receiptUrl"],
    },
  },
] as const;

export type McpToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export async function callMcpTool(
  client: HioClient,
  name: string,
  args: Record<string, unknown>,
): Promise<McpToolResult> {
  switch (name) {
    case "resolve_card": {
      const result = await client.resolveCard({
        type: args.type as "domain" | "github" | "url",
        identifier: String(args.identifier),
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
    case "fetch_card_markdown": {
      const markdown = await client.fetchCardMarkdown(String(args.url));
      return { content: [{ type: "text", text: markdown }] };
    }
    case "fetch_card_json": {
      const cardJson = await client.fetchCardJson(String(args.url));
      return {
        content: [{ type: "text", text: JSON.stringify(cardJson, null, 2) }],
      };
    }
    case "submit_ask_first_note": {
      const cardJsonUrl = String(args.cardJsonUrl);
      const cardJson = await client.fetchCardJson(cardJsonUrl);
      const result = await client.submitAskFirstNotePlaintext({
        cardJson,
        plaintext: args.plaintext as AskFirstPlaintext,
        interpretedBoundary: args.interpretedBoundary as
          InterpretedBoundary | undefined,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
    case "get_receipt": {
      const receipt = await client.getReceipt(String(args.receiptUrl));
      return {
        content: [{ type: "text", text: JSON.stringify(receipt, null, 2) }],
      };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export function handleMcpMethod(
  method: string,
  params?: Record<string, unknown>,
): unknown {
  if (method === "initialize") {
    return {
      protocolVersion: MCP_PROTOCOL_VERSION,
      serverInfo: { name: "hio-mcp", version: "0.1.0" },
      capabilities: { tools: {} },
    };
  }

  if (method === "tools/list") {
    return { tools: MCP_TOOLS };
  }

  if (method === "ping") {
    return {};
  }

  if (method === "tools/call") {
    return params;
  }

  throw new Error(`Unsupported method: ${method}`);
}
