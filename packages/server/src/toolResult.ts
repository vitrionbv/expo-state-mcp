import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export function okText(data: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text:
          typeof data === "string"
            ? data
            : JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2),
      },
    ],
  };
}

export function errText(message: string): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}
