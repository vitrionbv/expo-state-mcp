import type { BridgeContext, ApiResult } from "../types";
import { tryGetLanIPv4 } from "../util/ip";

export interface HealthData {
  appName?: string;
  dbPath: string;
  server: { port: number; host: string };
  stores: string[];
  lanIp?: string;
}

export async function handleHealth(
  ctx: BridgeContext,
  port: number,
  host: string,
): Promise<ApiResult<HealthData>> {
  const lanIp = await tryGetLanIPv4();
  return {
    ok: true,
    data: {
      appName: ctx.appName,
      dbPath: ctx.db.databasePath,
      server: { port, host },
      stores: Object.keys(ctx.stores).sort(),
      lanIp,
    },
  };
}
