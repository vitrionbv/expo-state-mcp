import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";
import {
  MAX_REQUEST_BODY_BYTES,
  PARSE_PAYLOAD_TOO_LARGE,
  tryParseHttpRequest,
} from "../src/app/util/http.ts";

function rawRequest(
  method: string,
  pathWithQuery: string,
  hdrs: Record<string, string> = {},
  body: string | Buffer = "",
): Buffer {
  const headerLines = [
    `${method} ${pathWithQuery} HTTP/1.1`,
    ...Object.entries(hdrs).map(([k, v]) => `${k}: ${v}`),
    "",
    "",
  ];
  const head = headerLines.join("\r\n");
  const b = typeof body === "string" ? Buffer.from(body, "utf8") : body;
  return Buffer.concat([Buffer.from(head, "utf8"), b]);
}

describe("tryParseHttpRequest", () => {
  it("returns null until headers complete", () => {
    expect(tryParseHttpRequest(Buffer.from("GET / HTTP/1.1\r\n"))).toBeNull();
  });

  it("parses GET with path and query", () => {
    const buf = rawRequest("GET", "/sqlite/schema?table=users");
    const p = tryParseHttpRequest(buf);
    expect(p).not.toBeNull();
    if (p === null || p === PARSE_PAYLOAD_TOO_LARGE) throw new Error("expected parsed");
    expect(p.method).toBe("GET");
    expect(p.path).toBe("/sqlite/schema");
    expect(p.query.table).toBe("users");
  });

  it("parses POST body by Content-Length", () => {
    const body = '{"sql":"select 1"}';
    const buf = rawRequest(
      "POST",
      "/sqlite/query",
      {
        "Content-Length": String(Buffer.byteLength(body)),
      },
      body,
    );
    const p = tryParseHttpRequest(buf);
    expect(p).not.toBeNull();
    if (p === null || p === PARSE_PAYLOAD_TOO_LARGE) throw new Error("expected parsed");
    expect(p.body.toString("utf8")).toBe(body);
  });

  it("returns PARSE_PAYLOAD_TOO_LARGE when Content-Length exceeds cap", () => {
    const buf = rawRequest("POST", "/sqlite/query", {
      "Content-Length": String(MAX_REQUEST_BODY_BYTES + 1),
    });
    expect(tryParseHttpRequest(buf)).toBe(PARSE_PAYLOAD_TOO_LARGE);
  });
});
