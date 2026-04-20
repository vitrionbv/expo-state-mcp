import { bridgeGet } from "./bridgeClient.js";

const DEFAULT_BASE = "http://127.0.0.1:9778";

/** Mirrors bridge `DeviceInfo` (CLI bundle has no RN types). */
export interface DeviceInfo {
  id: string;
  appName?: string;
  platform: string;
  osVersion?: string;
  model?: string;
  brand?: string;
  deviceName?: string;
  isPhysicalDevice?: boolean;
  lanIp?: string;
}

export interface BridgeEntry {
  url: string;
  alias?: string;
}

export interface ResolvedEntry extends BridgeEntry {
  info: DeviceInfo;
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/**
 * Parse configured bridge URLs from env.
 * - If `EXPO_STATE_MCP_BRIDGES` is unset or empty: one entry from `EXPO_STATE_MCP_BRIDGE_URL` (default loopback).
 * - If value starts with `[`: JSON array of `{ url, alias? }` or string URLs.
 * - Else: comma-separated base URLs.
 */
export function parseBridgeEntries(): BridgeEntry[] {
  const raw = process.env.EXPO_STATE_MCP_BRIDGES;
  const fallback =
    process.env.EXPO_STATE_MCP_BRIDGE_URL?.trim() || DEFAULT_BASE;

  if (raw == null || raw.trim() === "") {
    return [{ url: normalizeBaseUrl(fallback) }];
  }

  const t = raw.trim();
  if (t.startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(t) as unknown;
    } catch {
      throw new Error("EXPO_STATE_MCP_BRIDGES: invalid JSON");
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("EXPO_STATE_MCP_BRIDGES: expected non-empty JSON array");
    }
    return parsed.map((item, i) => {
      if (typeof item === "string") {
        return { url: normalizeBaseUrl(item) };
      }
      if (!item || typeof item !== "object") {
        throw new Error(`EXPO_STATE_MCP_BRIDGES[${i}]: expected string or object`);
      }
      const o = item as { url?: unknown; alias?: unknown };
      if (typeof o.url !== "string" || !o.url.trim()) {
        throw new Error(`EXPO_STATE_MCP_BRIDGES[${i}]: missing url`);
      }
      const alias =
        typeof o.alias === "string" && o.alias.trim() !== ""
          ? o.alias.trim()
          : undefined;
      return { url: normalizeBaseUrl(o.url), alias };
    });
  }

  return t
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((url) => ({ url: normalizeBaseUrl(url) }));
}

function parseProbeResponse(data: unknown): {
  ok: true;
  data: unknown;
  device?: DeviceInfo;
} | { ok: false; error: string } {
  if (!data || typeof data !== "object") {
    return { ok: false, error: "Invalid bridge response" };
  }
  const rec = data as Record<string, unknown>;
  if (rec.ok === true) {
    return {
      ok: true,
      data: rec.data,
      device: rec.device as DeviceInfo | undefined,
    };
  }
  if (rec.ok === false && typeof rec.error === "string") {
    return { ok: false, error: rec.error };
  }
  return { ok: false, error: JSON.stringify(data) };
}

function deviceFromProbe(
  u: { ok: true; data: unknown; device?: DeviceInfo },
): DeviceInfo {
  if (u.device && typeof u.device === "object" && typeof u.device.id === "string") {
    return u.device;
  }
  const d = u.data;
  if (d && typeof d === "object" && typeof (d as DeviceInfo).id === "string") {
    return d as DeviceInfo;
  }
  return { id: "unknown", platform: "unknown" };
}

function slugForLegacyId(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "app"
  );
}

/** Older bridges without `GET /device` — derive a stable-ish id from `/health`. */
async function tryLegacyDeviceFromHealth(url: string): Promise<DeviceInfo | null> {
  const raw = await bridgeGet("/health", url);
  const u = parseProbeResponse(raw);
  if (!u.ok) return null;
  const data = u.data;
  if (!data || typeof data !== "object") return null;
  const rec = data as Record<string, unknown>;
  const appName = typeof rec.appName === "string" ? rec.appName : undefined;
  const server = rec.server as { port?: number; host?: string } | undefined;
  const port = server?.port ?? 0;
  const host = server?.host ?? "host";
  const id = `legacy-${slugForLegacyId(host)}-${port}-${slugForLegacyId(appName ?? "app")}`;
  return {
    id,
    appName,
    platform: "unknown",
    deviceName: typeof rec.dbPath === "string" ? rec.dbPath : undefined,
  };
}

let resolved: ResolvedEntry[] | null = null;
let probeInflight: Promise<ResolvedEntry[]> | null = null;

/** Test hook: clear cached probe results. */
export function resetDeviceRegistryForTests(): void {
  resolved = null;
  probeInflight = null;
}

async function probeAll(): Promise<ResolvedEntry[]> {
  if (resolved) return resolved;
  if (probeInflight) return probeInflight;

  probeInflight = (async () => {
    const entries = parseBridgeEntries();
    const out: ResolvedEntry[] = [];
    for (const e of entries) {
      const raw = await bridgeGet("/device", e.url);
      const u = parseProbeResponse(raw);
      if (!u.ok) {
        const legacy =
          typeof u.error === "string" && u.error.includes("/device")
            ? await tryLegacyDeviceFromHealth(e.url)
            : null;
        if (!legacy) {
          throw new Error(`Bridge at ${e.url}: ${u.error}`);
        }
        out.push({ url: e.url, alias: e.alias, info: legacy });
        continue;
      }
      out.push({
        url: e.url,
        alias: e.alias,
        info: deviceFromProbe(u),
      });
    }
    resolved = out;
    return out;
  })();

  try {
    return await probeInflight;
  } finally {
    probeInflight = null;
  }
}

/**
 * Re-fetch `/device` for every configured bridge URL (used by `list_devices`).
 */
export async function refreshDevices(): Promise<ResolvedEntry[]> {
  resolved = null;
  return probeAll();
}

/**
 * Current resolved devices (probes on first use).
 */
export async function listResolvedDevices(
  refresh = false,
): Promise<ResolvedEntry[]> {
  if (refresh) resolved = null;
  return probeAll();
}

/**
 * Pick `{ url, info }` by device id, alias, env default, or single-bridge implicit default.
 */
export async function resolveDevice(
  deviceArg?: string | null,
): Promise<{ url: string; info: DeviceInfo }> {
  const entries = await listResolvedDevices(false);
  const byId = new Map<string, { url: string; info: DeviceInfo }>();
  const byAlias = new Map<string, { url: string; info: DeviceInfo }>();
  for (const e of entries) {
    byId.set(e.info.id, { url: e.url, info: e.info });
    if (e.alias) {
      byAlias.set(e.alias, { url: e.url, info: e.info });
    }
  }

  const trimmedArg = deviceArg?.trim() ?? "";
  const envDefault = process.env.EXPO_STATE_MCP_DEFAULT_DEVICE?.trim() ?? "";
  const pick = trimmedArg || envDefault;

  if (pick) {
    const hit = byId.get(pick) ?? byAlias.get(pick);
    if (!hit) {
      const known = [...new Set([...byId.keys(), ...byAlias.keys()])].join(
        ", ",
      );
      throw new Error(`Unknown device "${pick}". Known ids/aliases: ${known}`);
    }
    return hit;
  }

  if (entries.length === 1) {
    return { url: entries[0].url, info: entries[0].info };
  }

  const ids = entries.map((e) => e.info.id).join(", ");
  throw new Error(
    `Multiple bridges (${entries.length}): set EXPO_STATE_MCP_DEFAULT_DEVICE or pass device=… Device ids: ${ids}`,
  );
}

/** Default device id for MCP `list_devices` (env or sole bridge). */
export async function getDefaultDeviceId(): Promise<string | null> {
  const env = process.env.EXPO_STATE_MCP_DEFAULT_DEVICE?.trim();
  if (env) return env;
  const entries = await listResolvedDevices(false);
  if (entries.length === 1) return entries[0].info.id;
  return null;
}
