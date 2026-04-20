import type * as SQLite from "expo-sqlite";
import type { StoreApi } from "zustand";
import type { StoreMap } from "./types";
import { startBridgeServer } from "./server";
import { tryGetLanIPv4 } from "./util/ip";

export type { StoreMap } from "./types";

export interface SetupBridgeOptions {
  /** TCP port (default 9778). */
  port?: number;
  /** Bind address. Default `127.0.0.1`. Use `0.0.0.0` when debugging on a physical device over LAN. */
  host?: string;
  /** When true, listens on `0.0.0.0` (overrides `host`). */
  bindAllInterfaces?: boolean;
  /** Shown in `/health`. */
  appName?: string;
  /** Open `expo-sqlite` database instance (e.g. from `openDatabaseSync`). */
  db: SQLite.SQLiteDatabase;
  /** Named Zustand stores (`create()` return values). */
  stores: Record<string, StoreApi<unknown>>;
  /** Optional Bearer token; must match `EXPO_STATE_MCP_TOKEN` on the MCP server. */
  token?: string | null;
}

let singleton: { close: () => void } | null = null;

/**
 * Mount the HTTP bridge (dev-only). Safe to call multiple times; only the first succeeds.
 */
export function setupBridge(options: SetupBridgeOptions): void {
  const isDev = typeof __DEV__ !== "undefined" && __DEV__;
  if (!isDev) return;
  if (singleton) return;

  const port = options.port ?? 9778;
  const host = options.bindAllInterfaces ? "0.0.0.0" : options.host ?? "127.0.0.1";

  try {
    singleton = startBridgeServer(
      {
        appName: options.appName,
        db: options.db,
        stores: options.stores,
        token: options.token,
      },
      { port, host },
    );

    console.log(`[expo-state-mcp] bridge http://${host}:${port} (SQLite + Zustand)`);

    void tryGetLanIPv4().then((ip) => {
      if (ip) {
        console.log(
          `[expo-state-mcp] device LAN IP ~ ${ip} → set EXPO_STATE_MCP_BRIDGE_URL=http://${ip}:${port} on your machine`,
        );
      }
    });
  } catch (e) {
    console.warn("[expo-state-mcp] failed to start bridge:", e);
  }
}

/** Stop the bridge (e.g. tests). */
export function teardownBridge(): void {
  singleton?.close();
  singleton = null;
}
