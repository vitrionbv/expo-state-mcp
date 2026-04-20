import type { SQLiteBindParams } from "expo-sqlite";
import type { BridgeContext, ApiResult } from "../types";

type QueryMode = "auto" | "all" | "run" | "exec";

function detectMode(sql: string): "all" | "run" | "exec" {
  const t = sql.trim();
  if (t.includes(";") && t.split(";").filter((s) => s.trim().length > 0).length > 1) {
    return "exec";
  }
  const first = t.split(/\s+/)[0]?.toUpperCase() ?? "";
  if (
    first === "SELECT" ||
    first === "WITH" ||
    first === "PRAGMA" ||
    first.startsWith("EXPLAIN")
  ) {
    return "all";
  }
  return "run";
}

export async function handleSqliteTables(ctx: BridgeContext): Promise<
  ApiResult<{ tables: { name: string }[] }>
> {
  try {
    const rows = await ctx.db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    return { ok: true, data: { tables: rows } };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function handleSqliteSchema(
  ctx: BridgeContext,
  table: string | undefined,
): Promise<
  ApiResult<{ columns: { cid: number; name: string; type: string; notnull: number; dflt_value: unknown; pk: number }[] }>
> {
  if (!table) {
    return { ok: false, error: "Missing table query parameter" };
  }
  try {
    const rows = await ctx.db.getAllAsync<{
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: unknown;
      pk: number;
    }>(`PRAGMA table_info(${quoteIdent(table)})`);
    return { ok: true, data: { columns: rows } };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** SQLite identifier quoting for pragma — table names from user must be validated. */
function quoteIdent(ident: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(ident)) {
    throw new Error("Invalid table name");
  }
  return `"${ident.replace(/"/g, '""')}"`;
}

export async function handleSqliteQuery(
  ctx: BridgeContext,
  body: {
    sql?: string;
    params?: unknown[];
    mode?: QueryMode;
  },
): Promise<ApiResult<unknown>> {
  const sql = body.sql;
  if (!sql || typeof sql !== "string") {
    return { ok: false, error: "Missing sql" };
  }
  const rawParams = Array.isArray(body.params) ? body.params : [];
  /** Bridge JSON may contain `undefined`; expo-sqlite bind values must not. */
  const bindParams = rawParams as SQLiteBindParams;
  const mode = body.mode === "auto" || !body.mode ? detectMode(sql) : body.mode;

  try {
    if (mode === "all") {
      const rows =
        rawParams.length === 0
          ? await ctx.db.getAllAsync<Record<string, unknown>>(sql)
          : await ctx.db.getAllAsync<Record<string, unknown>>(sql, bindParams);
      return { ok: true, data: { rows } };
    }
    if (mode === "run") {
      const res =
        rawParams.length === 0
          ? await ctx.db.runAsync(sql)
          : await ctx.db.runAsync(sql, bindParams);
      return {
        ok: true,
        data: {
          lastInsertRowId: res.lastInsertRowId,
          changes: res.changes,
        },
      };
    }
    if (mode === "exec") {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.execAsync(sql);
      });
      return { ok: true, data: { executed: true } };
    }
    return { ok: false, error: `Unknown mode: ${mode}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
