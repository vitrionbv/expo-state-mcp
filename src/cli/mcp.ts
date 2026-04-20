import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { bridgeGet, bridgePost } from "./bridgeClient.js";
import {
  getDefaultDeviceId,
  listResolvedDevices,
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
  .describe("Device id or alias from list_devices (required when multiple bridges are configured).");

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

export async function runMcp(): Promise<void> {
  const server = new McpServer({
    name: "expo-state-mcp",
    version: packageVersion,
  });

  server.registerTool(
    "list_devices",
    {
      description:
        "List Expo bridge targets (device id, platform, app name) from EXPO_STATE_MCP_BRIDGES / EXPO_STATE_MCP_BRIDGE_URL. Probes each URL via GET /device. Use refresh=true to re-fetch.",
      inputSchema: z.object({
        refresh: z.boolean().optional(),
      }),
    },
    async ({ refresh }) => {
      try {
        const entries = await listResolvedDevices(refresh ?? false);
        const defaultId = await getDefaultDeviceId();
        return okText({
          default: defaultId,
          devices: entries.map((e) => e.info),
        });
      } catch (e) {
        return errText(String(e));
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
      try {
        const target = await resolveDevice(device);
        const raw = await bridgeGet("/sqlite/tables", target.url);
        const u = unwrapApi(raw);
        if (!u.ok) return errText(u.error ?? "Unknown error");
        return okWithDevice(u.device ?? target.info, u.payload);
      } catch (e) {
        return errText(String(e));
      }
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
      try {
        const target = await resolveDevice(device);
        const raw = await bridgeGet(
          `/sqlite/schema?table=${encodeURIComponent(table)}`,
          target.url,
        );
        const u = unwrapApi(raw);
        if (!u.ok) return errText(u.error ?? "Unknown error");
        return okWithDevice(u.device ?? target.info, u.payload);
      } catch (e) {
        return errText(String(e));
      }
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
      try {
        const target = await resolveDevice(device);
        const raw = await bridgePost("/sqlite/query", body, target.url);
        const u = unwrapApi(raw);
        if (!u.ok) return errText(u.error ?? "Unknown error");
        return okWithDevice(u.device ?? target.info, u.payload);
      } catch (e) {
        return errText(String(e));
      }
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
      try {
        const target = await resolveDevice(device);
        const raw = await bridgePost(
          "/sqlite/query",
          {
            sql: `EXPLAIN QUERY PLAN ${sql}`,
            mode: "all",
          },
          target.url,
        );
        const u = unwrapApi(raw);
        if (!u.ok) return errText(u.error ?? "Unknown error");
        return okWithDevice(u.device ?? target.info, u.payload);
      } catch (e) {
        return errText(String(e));
      }
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
      try {
        const target = await resolveDevice(device);
        const raw = await bridgeGet("/zustand/stores", target.url);
        const u = unwrapApi(raw);
        if (!u.ok) return errText(u.error ?? "Unknown error");
        return okWithDevice(u.device ?? target.info, u.payload);
      } catch (e) {
        return errText(String(e));
      }
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
      try {
        const target = await resolveDevice(device);
        const q =
          path !== undefined
            ? `?name=${encodeURIComponent(name)}&path=${encodeURIComponent(path)}`
            : `?name=${encodeURIComponent(name)}`;
        const raw = await bridgeGet(`/zustand/state${q}`, target.url);
        const u = unwrapApi(raw);
        if (!u.ok) return errText(u.error ?? "Unknown error");
        return okWithDevice(u.device ?? target.info, u.payload);
      } catch (e) {
        return errText(String(e));
      }
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
      try {
        const target = await resolveDevice(device);
        const raw = await bridgePost("/zustand/state", body, target.url);
        const u = unwrapApi(raw);
        if (!u.ok) return errText(u.error ?? "Unknown error");
        return okWithDevice(u.device ?? target.info, u.payload);
      } catch (e) {
        return errText(String(e));
      }
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
      try {
        const target = await resolveDevice(device);
        const raw = await bridgePost("/zustand/call", body, target.url);
        const u = unwrapApi(raw);
        if (!u.ok) return errText(u.error ?? "Unknown error");
        return okWithDevice(u.device ?? target.info, u.payload);
      } catch (e) {
        return errText(String(e));
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
