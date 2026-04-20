import type * as SQLite from "expo-sqlite";
import type { StoreApi } from "zustand";

/** Map of logical name -> Zustand store returned from `create()`. */
export type StoreMap = Record<string, StoreApi<unknown>>;

export interface BridgeContext {
  appName?: string;
  db: SQLite.SQLiteDatabase;
  stores: StoreMap;
  token: string | null | undefined;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };
