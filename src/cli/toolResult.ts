import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { DeviceInfo } from "./devices.js";

function stringifyJson(data: unknown): string {
  return JSON.stringify(
    data,
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  );
}

export function okText(data: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text:
          typeof data === "string"
            ? data
            : stringifyJson(data),
      },
    ],
  };
}

/** Tool success body: `{ device, data }` (device may be null for very old bridges). */
export function okWithDevice(
  device: DeviceInfo | undefined | null,
  payload: unknown,
): CallToolResult {
  return okText({ device: device ?? null, data: payload });
}

export function errText(message: string): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}
