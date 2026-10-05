import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { bridgeGet, bridgePost } from "./bridgeClient.js";
import {
  defaultSelection,
  getDefaultDeviceId,
  getRegistry,
  selectorsFor,
  type DeviceInfo,
  resolveDevice,
} from "./devices.js";
import { errText, okWithDevice, okText } from "./toolResult.js";

/** Resolved at runtime from repo root `package.json` (next to `dist/`). */
const packageVersion = (
  JSON.parse(
    readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json"),
      "utf8",
    ),
  ) as { version: string }
).version;

const deviceField = z
  .string()
  .optional()
  .describe(
    'Target app: "metro:<port>" (the Metro port the app was opened from), "bridge:<port>", "name:<device name>", "project:<path>", or a device id / alias from list_devices. Required when several bridges are live.',
  );

function unwrapApi(data: unknown):
  | { ok: true; payload: unknown; device?: DeviceInfo }
  | { ok: false; error: string } {
  if (!data || typeof data !== "object") {
    return { ok: false, error: "Invalid bridge response" };
  }
  const rec = data as Record<string, unknown>;
  if (rec.ok === true) {
    return {
      ok: true,
      payload: rec.data,
      device: rec.device as DeviceInfo | undefined,
    };
  }
  if (rec.ok === false && typeof rec.error === "string") {
    return { ok: false, error: rec.error };
  }
  return { ok: false, error: JSON.stringify(data) };
}

/**
 * Resolve the target, call the bridge, wrap `{ device, data }`.
 * When the bridge is gone (app reloaded or moved port), re-probe once and retry.
 */
async function callDevice(
  device: string | undefined,
  call: (url: string) => Promise<unknown>,
) {
  try {
    let target = await resolveDevice(device);
    let raw: unknown;
    try {
      raw = await call(target.url);
    } catch (e) {
      if (!String(e).includes("Bridge unreachable")) throw e;
      target = await resolveDevice(device, { refresh: true });
      raw = await call(target.url);
    }
    const u = unwrapApi(raw);
    if (!u.ok) return errText(u.error ?? "Unknown error");
    return okWithDevice({ ...(u.device ?? target.info), url: target.url }, u.payload);
  } catch (e) {
    return errText(e instanceof Error ? e.message : String(e));
  }
}

export async function runMcp(): Promise<void> {
  const server = new McpServer({
    name: "expo-state-mcp",
    version: packageVersion,
  });

  server.registerTool(
    "list_devices",
    {
      description:
        "List running Expo apps with an expo-state-mcp bridge. Scans 127.0.0.1 ports EXPO_STATE_MCP_PORT_RANGE (default 9778-9797) plus EXPO_STATE_MCP_BRIDGE_URL / EXPO_STATE_MCP_BRIDGES. Each device shows its Metro port, device name, bridge URL, Metro project root and the selectors to pass as `device`. Use refresh=true to re-probe.",
      inputSchema: z.object({
        refresh: z.boolean().optional(),
      }),
    },
    async ({ refresh }) => {
      try {
        const registry = await getRegistry(refresh ?? false);
        const defaultId = await getDefaultDeviceId();
        const def = defaultSelection(registry.devices);
        return okText({
          default: defaultId,
          defaultReason: def.reason,
          devices: registry.devices.map((e) => ({
            ...e.info,
            url: e.url,
            alias: e.alias,
            projectRoot: e.projectRoot,
            selectors: selectorsFor(e),
          })),
          unreachable: registry.unreachable,
        });
      } catch (e) {
        return errText(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "sqlite_list_tables",
    {
      description: "List SQLite table names from the running app's database.",
      inputSchema: z.object({
        device: deviceField,
      }),
    },
    async ({ device }) => {
      return callDevice(device, (url) =>
        bridgeGet("/sqlite/tables", url),
      );
    },
  );

  server.registerTool(
    "sqlite_describe_table",
    {
      description: "Describe columns for a SQLite table (PRAGMA table_info).",
      inputSchema: z.object({
        device: deviceField,
        table: z.string().describe("Table name"),
      }),
    },
    async ({ device, table }) => {
      return callDevice(device, (url) =>
        bridgeGet(`/sqlite/schema?table=${encodeURIComponent(table)}`, url),
      );
    },
  );

  server.registerTool(
    "sqlite_query",
    {
      description:
        "Execute SQL via the app's expo-sqlite connection (SELECT uses getAllAsync; writes use runAsync; multi-statement uses exec inside a transaction).",
      inputSchema: z.object({
        device: deviceField,
        sql: z.string(),
        params: z.array(z.any()).optional(),
        mode: z.enum(["auto", "all", "run", "exec"]).optional(),
      }),
    },
    async (args) => {
      const { device, ...body } = args;
      return callDevice(device, (url) =>
        bridgePost("/sqlite/query", body, url),
      );
    },
  );

  server.registerTool(
    "sqlite_explain",
    {
      description: "Run EXPLAIN QUERY PLAN for a SELECT-style statement.",
      inputSchema: z.object({
        device: deviceField,
        sql: z.string(),
      }),
    },
    async ({ device, sql }) => {
      return callDevice(device, (url) =>
        bridgePost(
          "/sqlite/query",
          { sql: `EXPLAIN QUERY PLAN ${sql}`, mode: "all" },
          url,
        ),
      );
    },
  );

  server.registerTool(
    "zustand_list_stores",
    {
      description: "List registered Zustand store names exposed to the bridge.",
      inputSchema: z.object({
        device: deviceField,
      }),
    },
    async ({ device }) => {
      return callDevice(device, (url) =>
        bridgeGet("/zustand/stores", url),
      );
    },
  );

  server.registerTool(
    "zustand_get",
    {
      description: "Read Zustand state (optionally a dot-path). Functions omitted.",
      inputSchema: z.object({
        device: deviceField,
        name: z.string(),
        path: z.string().optional(),
      }),
    },
    async ({ device, name, path }) => {
      const q =
        path !== undefined
          ? `?name=${encodeURIComponent(name)}&path=${encodeURIComponent(path)}`
          : `?name=${encodeURIComponent(name)}`;
      return callDevice(device, (url) => bridgeGet(`/zustand/state${q}`, url));
    },
  );

  server.registerTool(
    "zustand_set",
    {
      description:
        "Update Zustand state via setState — merge or replace at optional dot-path.",
      inputSchema: z.object({
        device: deviceField,
        name: z.string(),
        path: z.string().optional(),
        value: z.any(),
        mode: z.enum(["merge", "set"]).optional(),
      }),
    },
    async (args) => {
      const { device, ...body } = args;
      return callDevice(device, (url) =>
        bridgePost("/zustand/state", body, url),
      );
    },
  );

  server.registerTool(
    "zustand_call",
    {
      description:
        "Call a synchronous method on the Zustand store snapshot (store.getState()[action](...args)). Async actions are rejected by the bridge.",
      inputSchema: z.object({
        device: deviceField,
        name: z.string(),
        action: z.string(),
        args: z.array(z.any()).optional(),
      }),
    },
    async (args) => {
      const { device, ...body } = args;
      return callDevice(device, (url) =>
        bridgePost("/zustand/call", body, url),
      );
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
