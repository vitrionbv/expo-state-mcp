import type * as SQLite from "expo-sqlite";
import type { StoreApi } from "zustand";
import { startBridgeServer } from "./server";
import { collectDeviceInfo } from "./util/device";
import { portCandidates } from "./util/listen";

export type { DeviceInfo, StoreMap } from "./types";
export type { MetroInfo } from "./util/device";

/** Default first bridge port; the CLI scans `DEFAULT_PORT … DEFAULT_PORT + DEFAULT_PORT_RANGE - 1`. */
export const DEFAULT_PORT = 9778;
export const DEFAULT_PORT_RANGE = 20;

export interface SetupBridgeOptions {
  /** First TCP port to try (default 9778). */
  port?: number;
  /**
   * How many ports to try from `port` when it is taken (default 20, so 9778-9797).
   * Several apps on iOS simulators share the Mac's loopback; each one takes the next free port.
   * Set to 1 to disable the fallback. Keep it within the CLI scan range (`EXPO_STATE_MCP_PORT_RANGE`).
   */
  portRange?: number;
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
let setupInflight: Promise<void> | null = null;

/**
 * Mount the HTTP bridge (dev-only). Safe to call multiple times; only the first succeeds.
 * Resolves after device info is collected and the server is listening.
 */
export async function setupBridge(options: SetupBridgeOptions): Promise<void> {
  const isDev = typeof __DEV__ !== "undefined" && __DEV__;
  if (!isDev) return;
  if (singleton) return;
  if (setupInflight) return setupInflight;

  setupInflight = (async () => {
    const firstPort = options.port ?? DEFAULT_PORT;
    const ports = portCandidates(firstPort, options.portRange ?? DEFAULT_PORT_RANGE);
    const host = options.bindAllInterfaces ? "0.0.0.0" : options.host ?? "127.0.0.1";

    try {
      if (singleton) return;
      const device = await collectDeviceInfo(options.appName);
      if (singleton) return;

      const started = await startBridgeServer(
        {
          appName: options.appName,
          db: options.db,
          stores: options.stores,
          token: options.token,
          device,
        },
        { host, ports },
      );
      if (singleton) {
        started.close();
        return;
      }
      singleton = started;
      const port = started.port;

      if (port !== firstPort) {
        console.log(
          `[expo-state-mcp] port ${firstPort} taken, using ${port} (skipped: ${started.skipped.map((s) => s.port).join(", ")})`,
        );
      }
      console.log(`[expo-state-mcp] bridge http://${host}:${port} (SQLite + Zustand)`);
      console.log(
        `[expo-state-mcp] device id: ${device.id}${device.metro ? ` (metro:${device.metro.port})` : ""}`,
      );

      if (device.lanIp) {
        console.log(
          `[expo-state-mcp] device LAN IP ~ ${device.lanIp} → set EXPO_STATE_MCP_BRIDGE_URL=http://${device.lanIp}:${port} on your machine`,
        );
      }
    } catch (e) {
      console.warn("[expo-state-mcp] failed to start bridge:", e);
    } finally {
      setupInflight = null;
    }
  })();

  return setupInflight;
}

/** Stop the bridge (e.g. tests). */
export function teardownBridge(): void {
  singleton?.close();
  singleton = null;
}
