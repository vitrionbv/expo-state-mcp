import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { bridgeGet, bridgePost } from "./bridgeClient.js";
import { errText, okText } from "./toolResult.js";

function unwrapApi(data: unknown): { ok: boolean; payload?: unknown; error?: string } {
  if (!data || typeof data !== "object") {
    return { ok: false, error: "Invalid bridge response" };
  }
  const rec = data as Record<string, unknown>;
  if (rec.ok === true) {
    return { ok: true, payload: rec.data };
  }
  if (rec.ok === false && typeof rec.error === "string") {
    return { ok: false, error: rec.error };
  }
  return { ok: false, error: JSON.stringify(data) };
}

export async function runMcp(): Promise<void> {
  const server = new McpServer({
    name: "expo-state-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "sqlite_list_tables",
    {
      description: "List SQLite table names from the running app's database.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const raw = await bridgeGet("/sqlite/tables");
        const u = unwrapApi(raw);
        if (!u.ok) return errText(u.error ?? "Unknown error");
        return okText(u.payload);
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
        table: z.string().describe("Table name"),
      }),
    },
    async ({ table }) => {
      try {
        const raw = await bridgeGet(
          `/sqlite/schema?table=${encodeURIComponent(table)}`,
        );
        const u = unwrapApi(raw);
        if (!u.ok) return errText(u.error ?? "Unknown error");
        return okText(u.payload);
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
        sql: z.string(),
        params: z.array(z.any()).optional(),
        mode: z.enum(["auto", "all", "run", "exec"]).optional(),
      }),
    },
    async (args) => {
      try {
        const raw = await bridgePost("/sqlite/query", args);
        const u = unwrapApi(raw);
        if (!u.ok) return errText(u.error ?? "Unknown error");
        return okText(u.payload);
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
        sql: z.string(),
      }),
    },
    async ({ sql }) => {
      try {
        const raw = await bridgePost("/sqlite/query", {
          sql: `EXPLAIN QUERY PLAN ${sql}`,
          mode: "all",
        });
        const u = unwrapApi(raw);
        if (!u.ok) return errText(u.error ?? "Unknown error");
        return okText(u.payload);
      } catch (e) {
        return errText(String(e));
      }
    },
  );

  server.registerTool(
    "zustand_list_stores",
    {
      description: "List registered Zustand store names exposed to the bridge.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const raw = await bridgeGet("/zustand/stores");
        const u = unwrapApi(raw);
        if (!u.ok) return errText(u.error ?? "Unknown error");
        return okText(u.payload);
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
        name: z.string(),
        path: z.string().optional(),
      }),
    },
    async ({ name, path }) => {
      try {
        const q =
          path !== undefined
            ? `?name=${encodeURIComponent(name)}&path=${encodeURIComponent(path)}`
            : `?name=${encodeURIComponent(name)}`;
        const raw = await bridgeGet(`/zustand/state${q}`);
        const u = unwrapApi(raw);
        if (!u.ok) return errText(u.error ?? "Unknown error");
        return okText(u.payload);
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
        name: z.string(),
        path: z.string().optional(),
        value: z.any(),
        mode: z.enum(["merge", "set"]).optional(),
      }),
    },
    async (args) => {
      try {
        const raw = await bridgePost("/zustand/state", args);
        const u = unwrapApi(raw);
        if (!u.ok) return errText(u.error ?? "Unknown error");
        return okText(u.payload);
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
        name: z.string(),
        action: z.string(),
        args: z.array(z.any()).optional(),
      }),
    },
    async (args) => {
      try {
        const raw = await bridgePost("/zustand/call", args);
        const u = unwrapApi(raw);
        if (!u.ok) return errText(u.error ?? "Unknown error");
        return okText(u.payload);
      } catch (e) {
        return errText(String(e));
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
