import { realpathSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { bridgeGet } from "./bridgeClient.js";
import { fetchMetroProjectRoot } from "./metroStatus.js";

const DEFAULT_BASE = "http://127.0.0.1:9778";
const SCAN_HOST = "127.0.0.1";
/** Must match the bridge default (`port` 9778, `portRange` 20). */
export const DEFAULT_PORT_RANGE = "9778-9797";
const MAX_SCAN_PORTS = 200;
const SCAN_TIMEOUT_MS = 800;
/** Explicit URLs (LAN devices) get longer than loopback, but never the 10 s tool-call timeout. */
const EXPLICIT_PROBE_TIMEOUT_MS = 2500;
const CACHE_TTL_MS = 3000;

export interface MetroInfo {
  url: string;
  host: string;
  port: number;
}

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
  applicationId?: string;
  metro?: MetroInfo | null;
  bridge?: { host: string; port: number };
  startedAt?: string;
}

export interface BridgeEntry {
  url: string;
  alias?: string;
}

export interface ResolvedEntry extends BridgeEntry {
  info: DeviceInfo;
  /** From Metro `/status` (`X-React-Native-Project-Root`), when Metro answers. */
  projectRoot?: string;
  /** Came from `EXPO_STATE_MCP_BRIDGES` / `EXPO_STATE_MCP_BRIDGE_URL` rather than the port scan. */
  explicit?: boolean;
}

export interface UnreachableEntry extends BridgeEntry {
  error: string;
}

export interface DeviceRegistry {
  devices: ResolvedEntry[];
  /** Explicit URLs that did not answer, and scanned bridges that refused (e.g. token mismatch). */
  unreachable: UnreachableEntry[];
}

export interface DiscoveryPlan {
  explicit: BridgeEntry[];
  /** Loopback ports to scan (empty when scanning is off). */
  scanPorts: number[];
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/** Dedupe key: `localhost` and `127.0.0.1` are the same bridge. */
function urlKey(url: string): string {
  return normalizeBaseUrl(url)
    .toLowerCase()
    .replace("://localhost:", "://127.0.0.1:")
    .replace("://[::1]:", "://127.0.0.1:");
}

/** Port in a bridge base URL (`http://127.0.0.1:9779` -> 9779). */
export function urlPort(url: string): number | undefined {
  const m = /^[a-z]+:\/\/(\[[^\]]+\]|[^/:?#]+)(?::(\d+))?/i.exec(url.trim());
  if (!m) return undefined;
  if (m[2]) return parseInt(m[2], 10);
  return url.toLowerCase().startsWith("https") ? 443 : 80;
}

/**
 * Parse explicitly configured bridge URLs from env.
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

/**
 * Parse `EXPO_STATE_MCP_PORT_RANGE`: `9778-9797`, `9778`, `9778-9790,9800` or `off` / `none` / `0` / `false`.
 * Returns `[]` when scanning is off.
 */
export function parsePortRange(raw: string): number[] {
  const t = raw.trim().toLowerCase();
  if (t === "" || t === "off" || t === "none" || t === "0" || t === "false") {
    return [];
  }
  const out = new Set<number>();
  for (const part of t.split(",")) {
    const p = part.trim();
    if (!p) continue;
    const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(p);
    if (!m) {
      throw new Error(`EXPO_STATE_MCP_PORT_RANGE: invalid segment "${p}" (use e.g. 9778-9797 or off)`);
    }
    const a = parseInt(m[1], 10);
    const b = m[2] ? parseInt(m[2], 10) : a;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (lo < 1 || hi > 65535) {
      throw new Error(`EXPO_STATE_MCP_PORT_RANGE: port out of range in "${p}"`);
    }
    for (let port = lo; port <= hi; port++) {
      out.add(port);
      if (out.size > MAX_SCAN_PORTS) {
        throw new Error(`EXPO_STATE_MCP_PORT_RANGE: more than ${MAX_SCAN_PORTS} ports`);
      }
    }
  }
  return [...out].sort((x, y) => x - y);
}

/**
 * What to probe:
 * - `EXPO_STATE_MCP_BRIDGES` set: that list only; scan only when `EXPO_STATE_MCP_PORT_RANGE` is set too.
 * - otherwise: scan `EXPO_STATE_MCP_PORT_RANGE` (default 9778-9797) on 127.0.0.1, plus
 *   `EXPO_STATE_MCP_BRIDGE_URL` when set. With scanning off, falls back to `BRIDGE_URL` / default loopback.
 */
export function discoveryPlan(): DiscoveryPlan {
  const bridgesRaw = process.env.EXPO_STATE_MCP_BRIDGES?.trim() ?? "";
  const bridgeUrl = process.env.EXPO_STATE_MCP_BRIDGE_URL?.trim() ?? "";
  const rangeRaw = process.env.EXPO_STATE_MCP_PORT_RANGE;
  const rangeSet = rangeRaw != null && rangeRaw.trim() !== "";

  if (bridgesRaw !== "") {
    return {
      explicit: parseBridgeEntries(),
      scanPorts: rangeSet ? parsePortRange(rangeRaw) : [],
    };
  }

  const scanPorts = parsePortRange(rangeSet ? rangeRaw : DEFAULT_PORT_RANGE);
  if (bridgeUrl !== "") {
    return { explicit: [{ url: normalizeBaseUrl(bridgeUrl) }], scanPorts };
  }
  return {
    explicit: scanPorts.length === 0 ? [{ url: DEFAULT_BASE }] : [],
    scanPorts,
  };
}

function parseProbeResponse(data: unknown): {
  ok: true;
  data: unknown;
  device?: DeviceInfo;
} | { ok: false; error: string } | null {
  if (!data || typeof data !== "object") return null;
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
  return null;
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
async function tryLegacyDeviceFromHealth(
  url: string,
  timeoutMs?: number,
): Promise<DeviceInfo | null> {
  const raw =
    timeoutMs === undefined
      ? await bridgeGet("/health", url)
      : await bridgeGet("/health", url, { timeoutMs });
  const u = parseProbeResponse(raw);
  if (!u || !u.ok) return null;
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

type ProbeOutcome =
  | { kind: "device"; info: DeviceInfo }
  | { kind: "error"; error: string }
  /** Nothing listening, or not an expo-state-mcp bridge. */
  | { kind: "absent"; error: string };

async function probeOne(url: string, timeoutMs?: number): Promise<ProbeOutcome> {
  let raw: unknown;
  try {
    raw =
      timeoutMs === undefined
        ? await bridgeGet("/device", url)
        : await bridgeGet("/device", url, { timeoutMs });
  } catch (e) {
    return { kind: "absent", error: e instanceof Error ? e.message : String(e) };
  }
  const u = parseProbeResponse(raw);
  if (!u) return { kind: "absent", error: "Not an expo-state-mcp bridge" };
  if (u.ok) return { kind: "device", info: deviceFromProbe(u) };
  if (u.error.includes("/device")) {
    try {
      const legacy = await tryLegacyDeviceFromHealth(url, timeoutMs);
      if (legacy) return { kind: "device", info: legacy };
    } catch {
      /* fall through */
    }
  }
  return { kind: "error", error: u.error };
}

async function attachProjectRoot(e: ResolvedEntry): Promise<ResolvedEntry> {
  const m = e.info.metro;
  if (!m || typeof m.port !== "number" || typeof m.host !== "string") return e;
  const projectRoot = await fetchMetroProjectRoot(m.host, m.port);
  return projectRoot ? { ...e, projectRoot } : e;
}

/** Probe explicit entries and scan ports in parallel. Never throws for unreachable bridges. */
export async function discoverDevices(plan: DiscoveryPlan = discoveryPlan()): Promise<DeviceRegistry> {
  const explicitKeys = new Set(plan.explicit.map((e) => urlKey(e.url)));
  const scanEntries = plan.scanPorts
    .map((port) => ({ url: `http://${SCAN_HOST}:${port}` }))
    .filter((e) => !explicitKeys.has(urlKey(e.url)));

  const [explicitResults, scanResults] = await Promise.all([
    Promise.all(plan.explicit.map((e) => probeOne(e.url, EXPLICIT_PROBE_TIMEOUT_MS))),
    Promise.all(scanEntries.map((e) => probeOne(e.url, SCAN_TIMEOUT_MS))),
  ]);

  const devices: ResolvedEntry[] = [];
  const unreachable: UnreachableEntry[] = [];

  plan.explicit.forEach((e, i) => {
    const r = explicitResults[i];
    if (r.kind === "device") devices.push({ ...e, info: r.info, explicit: true });
    else unreachable.push({ ...e, error: r.error });
  });
  scanEntries.forEach((e, i) => {
    const r = scanResults[i];
    if (r.kind === "device") devices.push({ ...e, info: r.info });
    else if (r.kind === "error") unreachable.push({ ...e, error: r.error });
  });

  return {
    devices: await Promise.all(devices.map(attachProjectRoot)),
    unreachable,
  };
}

let cache: { at: number; registry: DeviceRegistry } | null = null;
let probeInflight: Promise<DeviceRegistry> | null = null;

/** Test hook: clear cached probe results. */
export function resetDeviceRegistryForTests(): void {
  cache = null;
  probeInflight = null;
}

/** Devices + unreachable entries; re-probes when the cache is older than a few seconds. */
export async function getRegistry(refresh = false): Promise<DeviceRegistry> {
  if (refresh) cache = null;
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.registry;
  if (probeInflight) return probeInflight;

  probeInflight = discoverDevices().then((registry) => {
    cache = { at: Date.now(), registry };
    return registry;
  });
  try {
    return await probeInflight;
  } finally {
    probeInflight = null;
  }
}

/** Re-probe every bridge (used by `list_devices` refresh). */
export async function refreshDevices(): Promise<ResolvedEntry[]> {
  return (await getRegistry(true)).devices;
}

/** Current resolved devices (probes on first use). */
export async function listResolvedDevices(
  refresh = false,
): Promise<ResolvedEntry[]> {
  return (await getRegistry(refresh)).devices;
}

function canonicalPath(p: string): string {
  const abs = resolvePath(p);
  try {
    return realpathSync(abs);
  } catch {
    return abs;
  }
}

/** Selectors that pick this entry (`metro:8095`, `bridge:9779`, `name:iPhone Air`, `project:/…`, id, alias). */
export function selectorsFor(e: ResolvedEntry): string[] {
  const out: string[] = [];
  if (e.info.metro?.port) out.push(`metro:${e.info.metro.port}`);
  const bp = urlPort(e.url);
  if (bp !== undefined) out.push(`bridge:${bp}`);
  if (e.info.deviceName) out.push(`name:${e.info.deviceName}`);
  if (e.projectRoot) out.push(`project:${e.projectRoot}`);
  if (e.alias) out.push(e.alias);
  out.push(e.info.id);
  return out;
}

function parsePortSelector(v: string, label: string): number {
  const n = Number(v.trim());
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`Invalid ${label} selector "${v}" (expected a port number)`);
  }
  return n;
}

function eqName(e: ResolvedEntry, name: string): boolean {
  const n = name.trim().toLowerCase();
  return (
    (e.info.deviceName?.toLowerCase() === n) ||
    (e.info.model?.toLowerCase() === n)
  );
}

/**
 * All entries matching a selector:
 * `metro:<port>`, `bridge:<port>` (alias `port:`), `name:<device name>`, `project:<path>`,
 * or a bare id / alias / device name.
 */
export function matchSelector(entries: ResolvedEntry[], selector: string): ResolvedEntry[] {
  const sel = selector.trim();
  const idx = sel.indexOf(":");
  const prefix = idx > 0 ? sel.slice(0, idx).toLowerCase() : "";
  const value = idx > 0 ? sel.slice(idx + 1) : sel;

  switch (prefix) {
    case "metro": {
      const port = parsePortSelector(value, "metro");
      return entries.filter((e) => e.info.metro?.port === port);
    }
    case "bridge":
    case "port": {
      const port = parsePortSelector(value, "bridge");
      return entries.filter((e) => urlPort(e.url) === port);
    }
    case "name":
      return entries.filter((e) => eqName(e, value));
    case "project": {
      const want = canonicalPath(value.trim());
      return entries.filter((e) => e.projectRoot && canonicalPath(e.projectRoot) === want);
    }
    default:
      break;
  }

  const byId = entries.filter((e) => e.info.id === sel);
  if (byId.length) return byId;
  const byAlias = entries.filter((e) => e.alias === sel);
  if (byAlias.length) return byAlias;
  return entries.filter((e) => eqName(e, sel));
}

/** One line per device for error messages. */
export function describeEntry(e: ResolvedEntry): string {
  const name = e.info.deviceName ?? e.info.model ?? e.info.platform;
  const os = e.info.osVersion ? ` ${e.info.osVersion}` : "";
  const app = e.info.appName ? ` [${e.info.appName}]` : "";
  const sels = selectorsFor(e).filter((s) => s !== e.info.id && !s.startsWith("name:"));
  return `- ${e.info.id}: ${name} (${e.info.platform}${os})${app} ${sels.join(" ")}`.trimEnd();
}

function deviceListText(entries: ResolvedEntry[]): string {
  return entries.length ? entries.map(describeEntry).join("\n") : "(no bridges found)";
}

export interface DefaultSelection {
  /** Selector that picks the default, if any. */
  selector: string | null;
  reason: string;
}

/** Where the implicit device comes from when a tool omits `device`. */
export function defaultSelection(entries: ResolvedEntry[]): DefaultSelection {
  const envDefault = process.env.EXPO_STATE_MCP_DEFAULT_DEVICE?.trim() ?? "";
  if (envDefault) return { selector: envDefault, reason: "EXPO_STATE_MCP_DEFAULT_DEVICE" };
  const metroPort = process.env.EXPO_STATE_MCP_METRO_PORT?.trim() ?? "";
  if (metroPort) return { selector: `metro:${metroPort}`, reason: "EXPO_STATE_MCP_METRO_PORT" };
  if (entries.length === 1) return { selector: entries[0].info.id, reason: "only bridge" };
  return {
    selector: null,
    reason:
      entries.length === 0
        ? "no bridges found"
        : `${entries.length} bridges: pass device (e.g. metro:<port>) or set EXPO_STATE_MCP_METRO_PORT / EXPO_STATE_MCP_DEFAULT_DEVICE`,
  };
}

/** `stale: true` when a fresh probe could change the answer (selector missed, nothing found). */
type Miss = { error: string; stale: boolean };

function pickFrom(
  entries: ResolvedEntry[],
  selector: string,
  source: string,
): ResolvedEntry | Miss {
  const hits = matchSelector(entries, selector);
  if (hits.length === 1) return hits[0];
  if (hits.length === 0) {
    return {
      error: `No device matches "${selector}" (${source}). Live bridges:\n${deviceListText(entries)}`,
      stale: true,
    };
  }
  return {
    error: `"${selector}" (${source}) matches ${hits.length} devices, use a more specific selector:\n${deviceListText(hits)}`,
    stale: false,
  };
}

/**
 * Pick `{ url, info }` from the `device` argument, `EXPO_STATE_MCP_DEFAULT_DEVICE`,
 * `EXPO_STATE_MCP_METRO_PORT`, or the only live bridge. Never guesses between several bridges.
 * Re-probes once when the selector finds nothing (the app may have reloaded or moved ports).
 */
export async function resolveDevice(
  deviceArg?: string | null,
  opts?: { refresh?: boolean },
): Promise<{ url: string; info: DeviceInfo }> {
  const cachedAt = cache?.at;
  let registry = await getRegistry(opts?.refresh ?? false);
  const fromCache = cachedAt !== undefined && cache?.at === cachedAt;
  let attempt = resolveFrom(registry, deviceArg);
  if ("error" in attempt && attempt.stale && fromCache) {
    registry = await getRegistry(true);
    attempt = resolveFrom(registry, deviceArg);
  }
  if ("error" in attempt) throw new Error(attempt.error);
  return { url: attempt.url, info: attempt.info };
}

function resolveFrom(
  registry: DeviceRegistry,
  deviceArg?: string | null,
): ResolvedEntry | Miss {
  const entries = registry.devices;
  const arg = deviceArg?.trim() ?? "";
  if (arg) return pickFrom(entries, arg, "device argument");

  const def = defaultSelection(entries);
  if (def.selector) return pickFrom(entries, def.selector, def.reason);

  if (entries.length === 0) {
    const unreachable = registry.unreachable
      .map((u) => `- ${u.url}: ${u.error}`)
      .join("\n");
    return {
      error:
        "No expo-state-mcp bridge found. Is the app running with setupBridge()? " +
        "Android: adb forward a host port to the bridge (adb forward tcp:9790 tcp:9778). Physical device: set EXPO_STATE_MCP_BRIDGE_URL." +
        (unreachable ? `\nUnreachable:\n${unreachable}` : ""),
      stale: true,
    };
  }
  return {
    error:
      `Multiple bridges (${entries.length}): pass device (e.g. "metro:<your Metro port>") ` +
      `or set EXPO_STATE_MCP_METRO_PORT / EXPO_STATE_MCP_DEFAULT_DEVICE.\n${deviceListText(entries)}`,
    stale: false,
  };
}

/** Default device id for MCP `list_devices` (null when ambiguous or the selector misses). */
export async function getDefaultDeviceId(): Promise<string | null> {
  const entries = await listResolvedDevices(false);
  const def = defaultSelection(entries);
  if (!def.selector) return null;
  const hits = matchSelector(entries, def.selector);
  return hits.length === 1 ? hits[0].info.id : null;
}
