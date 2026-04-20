import { Buffer } from "buffer";

/** Reject bodies larger than this to avoid OOM on malformed Content-Length (dev bridge). */
export const MAX_REQUEST_BODY_BYTES = 5 * 1024 * 1024;

/** Returned when `Content-Length` exceeds [MAX_REQUEST_BODY_BYTES]. */
export const PARSE_PAYLOAD_TOO_LARGE = "PARSE_PAYLOAD_TOO_LARGE" as const;

export interface ParsedHttpRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: Buffer;
}

export type TryParseHttpRequestResult =
  | ParsedHttpRequest
  | typeof PARSE_PAYLOAD_TOO_LARGE
  | null;

/** Minimal HTTP/1.1 request parser for JSON APIs (single request per connection). */
export function tryParseHttpRequest(buffer: Buffer): TryParseHttpRequestResult {
  const headerEnd = buffer.indexOf("\r\n\r\n");
  if (headerEnd === -1) return null;

  const headerText = buffer.slice(0, headerEnd).toString("utf8");
  const body = buffer.slice(headerEnd + 4);

  const lines = headerText.split("\r\n");
  const requestLine = lines[0];
  if (!requestLine) return null;
  const [method, urlPart] = requestLine.split(/\s+/);
  if (!method || !urlPart) return null;

  const url = new URL(urlPart, "http://127.0.0.1");
  const query: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });

  const headers: Record<string, string> = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const name = line.slice(0, idx).trim().toLowerCase();
    headers[name] = line.slice(idx + 1).trim();
  }

  const cl = headers["content-length"];
  const need = cl ? parseInt(cl, 10) : 0;
  if (Number.isNaN(need)) return null;
  if (need > MAX_REQUEST_BODY_BYTES) return PARSE_PAYLOAD_TOO_LARGE;
  if (body.length < need) return null;

  return {
    method: method.toUpperCase(),
    path: url.pathname,
    query,
    headers,
    body: body.slice(0, need),
  };
}

export function buildHttpResponse(opts: {
  status: number;
  headers?: Record<string, string>;
  body: string | Buffer;
}): Buffer {
  const statusText =
    opts.status === 200
      ? "OK"
      : opts.status === 404
        ? "Not Found"
        : opts.status === 401
          ? "Unauthorized"
          : opts.status === 413
            ? "Payload Too Large"
            : "Error";
  const bodyBuf = typeof opts.body === "string" ? Buffer.from(opts.body, "utf8") : opts.body;
  const h: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": String(bodyBuf.length),
    Connection: "close",
    ...(opts.headers ?? {}),
  };
  const lines = [`HTTP/1.1 ${opts.status} ${statusText}`];
  for (const [k, v] of Object.entries(h)) {
    lines.push(`${k}: ${v}`);
  }
  lines.push("", "");
  const head = Buffer.from(lines.join("\r\n"), "utf8");
  return Buffer.concat([head, bodyBuf]);
}
