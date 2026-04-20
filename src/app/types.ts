import type * as SQLite from "expo-sqlite";
import type { StoreApi } from "zustand";
import type { DeviceInfo } from "./util/device";

/** Map of logical name -> Zustand store returned from `create()`. */
export type StoreMap = Record<string, StoreApi<unknown>>;

export interface BridgeContext {
  appName?: string;
  db: SQLite.SQLiteDatabase;
  stores: StoreMap;
  token: string | null | undefined;
  device: DeviceInfo;
}

export type { DeviceInfo } from "./util/device";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };
