import type { BridgeContext } from "./types";
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
import { buildHttpResponse, tryParseHttpRequest } from "./util/http";

function checkAuth(
  headers: Record<string, string>,
  token: string | null | undefined,
): boolean {
  if (token == null || token === "") return true;
  const auth = headers["authorization"];
  if (!auth || !auth.startsWith("Bearer ")) return false;
  return auth.slice("Bearer ".length) === token;
}

function json(result: unknown, status = 200): { status: number; body: Buffer } {
  return {
    status,
    body: Buffer.from(JSON.stringify(result), "utf8"),
  };
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
    if (method === "GET" && pathname === "/health") {
      const r = await handleHealth(ctx, listen.port, listen.host);
      return json(r);
    }

    if (method === "GET" && pathname === "/sqlite/tables") {
      const r = await handleSqliteTables(ctx);
      return json(r);
    }

    if (method === "GET" && pathname === "/sqlite/schema") {
      const r = await handleSqliteSchema(ctx, query.table);
      return json(r);
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
      return json(r);
    }

    if (method === "GET" && pathname === "/zustand/stores") {
      const r = handleZustandStores(ctx);
      return json(r);
    }

    if (method === "GET" && pathname === "/zustand/state") {
      const r = handleZustandGet(ctx, query.name, query.path);
      return json(r);
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
      return json(r);
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
      return json(r);
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
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
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
      if (!parsed) return;

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
