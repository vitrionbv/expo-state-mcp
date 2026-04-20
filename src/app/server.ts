import { Buffer } from "buffer";
import type { ApiResult, BridgeContext } from "./types";
import { handleHealth } from "./handlers/health";
import {
  handleSqliteQuery,
  handleSqliteSchema,
  handleSqliteTables,
} from "./handlers/sqlite";
import {
  handleZustandCall,
  handleZustandGet,
  handleZustandSet,
  handleZustandStores,
} from "./handlers/zustand";
import {
  buildHttpResponse,
  PARSE_PAYLOAD_TOO_LARGE,
  tryParseHttpRequest,
} from "./util/http";

/** Constant-time string compare (no Node `crypto`; safe for RN bridge). */
function timingSafeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

function checkAuth(
  headers: Record<string, string>,
  token: string | null | undefined,
): boolean {
  if (token == null || token === "") return true;
  const auth = headers["authorization"];
  if (!auth || !auth.startsWith("Bearer ")) return false;
  const presented = auth.slice("Bearer ".length);
  return timingSafeEqualStrings(presented, token);
}

function json(result: unknown, status = 200): { status: number; body: Buffer } {
  return {
    status,
    body: Buffer.from(JSON.stringify(result), "utf8"),
  };
}

function wrapOk<T>(ctx: BridgeContext, r: ApiResult<T>): { status: number; body: Buffer } {
  if (!r.ok) return json(r);
  return json({ ok: true as const, device: ctx.device, data: r.data });
}

async function dispatch(
  ctx: BridgeContext,
  req: import("./util/http").ParsedHttpRequest,
  listen: { port: number; host: string },
): Promise<{ status: number; body: Buffer }> {
  if (!checkAuth(req.headers, ctx.token)) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  const { method, path: pathname, query } = req;

  try {
    if (method === "GET" && pathname === "/device") {
      return wrapOk(ctx, { ok: true, data: ctx.device });
    }

    if (method === "GET" && pathname === "/health") {
      const r = await handleHealth(ctx, listen.port, listen.host);
      return wrapOk(ctx, r);
    }

    if (method === "GET" && pathname === "/sqlite/tables") {
      const r = await handleSqliteTables(ctx);
      return wrapOk(ctx, r);
    }

    if (method === "GET" && pathname === "/sqlite/schema") {
      const r = await handleSqliteSchema(ctx, query.table);
      return wrapOk(ctx, r);
    }

    if (method === "POST" && pathname === "/sqlite/query") {
      const text = req.body.length ? req.body.toString("utf8") : "{}";
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(text) as Record<string, unknown>;
      } catch {
        return json({ ok: false, error: "Invalid JSON body" }, 400);
      }
      const r = await handleSqliteQuery(ctx, body);
      return wrapOk(ctx, r);
    }

    if (method === "GET" && pathname === "/zustand/stores") {
      const r = handleZustandStores(ctx);
      return wrapOk(ctx, r);
    }

    if (method === "GET" && pathname === "/zustand/state") {
      const r = handleZustandGet(ctx, query.name, query.path);
      return wrapOk(ctx, r);
    }

    if (method === "POST" && pathname === "/zustand/state") {
      const text = req.body.length ? req.body.toString("utf8") : "{}";
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(text) as Record<string, unknown>;
      } catch {
        return json({ ok: false, error: "Invalid JSON body" }, 400);
      }
      const r = handleZustandSet(ctx, body);
      return wrapOk(ctx, r);
    }

    if (method === "POST" && pathname === "/zustand/call") {
      const text = req.body.length ? req.body.toString("utf8") : "{}";
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(text) as Record<string, unknown>;
      } catch {
        return json({ ok: false, error: "Invalid JSON body" }, 400);
      }
      const r = handleZustandCall(ctx, body);
      return wrapOk(ctx, r);
    }

    return json({ ok: false, error: `Not found: ${method} ${pathname}` }, 404);
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
}

export interface StartBridgeOptions {
  port: number;
  host: string;
}

/** Start TCP HTTP server; only call from React Native dev. */
export function startBridgeServer(
  ctx: BridgeContext,
  listen: StartBridgeOptions,
): { close: () => void } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createServer } = require("react-native-tcp-socket") as {
    createServer: (cb: (s: Connection) => void) => {
      listen: (
        opts: { port: number; host?: string },
        cb?: () => void,
      ) => void;
      close: (cb?: (err?: Error) => void) => void;
      on: (ev: string, fn: (...a: unknown[]) => void) => void;
    };
  };

  type Connection = {
    on: (ev: string, fn: (...args: unknown[]) => void) => void;
    write: (buf: Buffer) => void;
    end: () => void;
  };

  const server = createServer((socket: Connection) => {
    const chunks: Buffer[] = [];
    socket.on("data", (chunk: unknown) => {
      const bufChunk = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk as Uint8Array);
      chunks.push(bufChunk);
      const buf = Buffer.concat(chunks);
      const parsed = tryParseHttpRequest(buf);
      if (parsed === null) return;
      if (parsed === PARSE_PAYLOAD_TOO_LARGE) {
        socket.write(
          buildHttpResponse({
            status: 413,
            body: Buffer.from(
              JSON.stringify({ ok: false, error: "Payload Too Large" }),
              "utf8",
            ),
          }),
        );
        socket.end();
        return;
      }

      void dispatch(ctx, parsed, listen).then(({ status, body }) => {
        socket.write(buildHttpResponse({ status, body }));
        socket.end();
      });
    });
    socket.on("error", () => {
      /* ignore */
    });
  });

  server.listen({ port: listen.port, host: listen.host }, () => {
    /* logged from setupBridge */
  });

  server.on("error", (err: unknown) => {
    console.warn("[expo-state-mcp] bridge server error:", err);
  });

  return {
    close: () => {
      server.close();
    },
  };
}
