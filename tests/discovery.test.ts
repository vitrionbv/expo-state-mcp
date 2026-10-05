import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bridgeGet } from "../src/cli/bridgeClient.js";
import {
  discoverDevices,
  discoveryPlan,
  getRegistry,
  matchSelector,
  parsePortRange,
  resetDeviceRegistryForTests,
  resolveDevice,
  selectorsFor,
  type DeviceInfo,
  type ResolvedEntry,
} from "../src/cli/devices";
import { fetchMetroProjectRoot } from "../src/cli/metroStatus.js";

vi.mock("../src/cli/bridgeClient.js", () => ({
  bridgeGet: vi.fn(),
}));
vi.mock("../src/cli/metroStatus.js", () => ({
  fetchMetroProjectRoot: vi.fn(),
}));

const bridgeGetMock = vi.mocked(bridgeGet);
const metroMock = vi.mocked(fetchMetroProjectRoot);

const MAIN = "/Users/me/app";
const WT = "/Users/me/app/.claude/worktrees/wt-1";

function dev(
  id: string,
  extra: Partial<DeviceInfo> & { metroPort?: number } = {},
): DeviceInfo {
  const { metroPort, ...rest } = extra;
  return {
    id,
    platform: "ios",
    appName: "app",
    ...(metroPort
      ? { metro: { url: `http://127.0.0.1:${metroPort}`, host: "127.0.0.1", port: metroPort } }
      : {}),
    ...rest,
  };
}

/** Route mocked `GET /device` by bridge URL; anything unlisted is connection refused. */
function serveBridges(byUrl: Record<string, unknown>) {
  bridgeGetMock.mockImplementation(async (path: string, url?: string) => {
    const body = url ? byUrl[url] : undefined;
    if (body === undefined) {
      throw new Error(`Bridge unreachable at ${url} (ECONNREFUSED)`);
    }
    if (path !== "/device") throw new Error(`unexpected ${path}`);
    return body;
  });
}

function ok(info: DeviceInfo) {
  return { ok: true, device: info, data: info };
}

const AIR = dev("ios-26-iphone-air-sim-a1", { deviceName: "iPhone Air", metroPort: 8095 });
const E17 = dev("ios-26-iphone-17e-sim-b2", { deviceName: "iPhone 17e", metroPort: 8081 });
const E17B = dev("ios-26-iphone-17e-sim-c3", { deviceName: "iPhone 17e", metroPort: 8083 });

function clearEnv() {
  for (const k of [
    "EXPO_STATE_MCP_BRIDGES",
    "EXPO_STATE_MCP_BRIDGE_URL",
    "EXPO_STATE_MCP_PORT_RANGE",
    "EXPO_STATE_MCP_DEFAULT_DEVICE",
    "EXPO_STATE_MCP_METRO_PORT",
  ]) {
    vi.stubEnv(k, "");
  }
}

beforeEach(() => {
  resetDeviceRegistryForTests();
  vi.unstubAllEnvs();
  clearEnv();
  bridgeGetMock.mockReset();
  metroMock.mockReset();
  metroMock.mockImplementation(async (_host: string, port: number) =>
    port === 8095 ? WT : port === 8081 || port === 8083 ? MAIN : undefined,
  );
});

afterEach(() => {
  resetDeviceRegistryForTests();
  vi.unstubAllEnvs();
});

describe("parsePortRange", () => {
  it("parses ranges, single ports and lists", () => {
    expect(parsePortRange("9778-9780")).toEqual([9778, 9779, 9780]);
    expect(parsePortRange("9790")).toEqual([9790]);
    expect(parsePortRange("9780-9778, 9800")).toEqual([9778, 9779, 9780, 9800]);
  });

  it("turns scanning off", () => {
    for (const v of ["off", "none", "0", "false", " OFF "]) {
      expect(parsePortRange(v)).toEqual([]);
    }
  });

  it("rejects junk and huge ranges", () => {
    expect(() => parsePortRange("abc")).toThrow(/invalid segment/);
    expect(() => parsePortRange("1-70000")).toThrow(/out of range/);
    expect(() => parsePortRange("1000-2000")).toThrow(/more than/);
  });
});

describe("discoveryPlan", () => {
  it("scans the default range when nothing is set", () => {
    const p = discoveryPlan();
    expect(p.explicit).toEqual([]);
    expect(p.scanPorts[0]).toBe(9778);
    expect(p.scanPorts.at(-1)).toBe(9797);
  });

  it("scans and keeps BRIDGE_URL as an explicit entry", () => {
    vi.stubEnv("EXPO_STATE_MCP_BRIDGE_URL", "http://192.168.1.5:9778/");
    const p = discoveryPlan();
    expect(p.explicit).toEqual([{ url: "http://192.168.1.5:9778" }]);
    expect(p.scanPorts).toHaveLength(20);
  });

  it("uses BRIDGES only unless PORT_RANGE is set explicitly", () => {
    vi.stubEnv("EXPO_STATE_MCP_BRIDGES", "http://127.0.0.1:1,http://127.0.0.1:2");
    expect(discoveryPlan().scanPorts).toEqual([]);
    vi.stubEnv("EXPO_STATE_MCP_PORT_RANGE", "9778-9779");
    expect(discoveryPlan().scanPorts).toEqual([9778, 9779]);
  });

  it("falls back to the default loopback URL when scanning is off", () => {
    vi.stubEnv("EXPO_STATE_MCP_PORT_RANGE", "off");
    expect(discoveryPlan()).toEqual({
      explicit: [{ url: "http://127.0.0.1:9778" }],
      scanPorts: [],
    });
  });
});

describe("discoverDevices", () => {
  it("finds every live bridge in the range and skips dead or foreign ports", async () => {
    serveBridges({
      "http://127.0.0.1:9778": ok(E17),
      "http://127.0.0.1:9779": ok(AIR),
      "http://127.0.0.1:9781": "<html>not a bridge</html>",
      "http://127.0.0.1:9782": { hello: "world" },
    });
    const r = await discoverDevices({ explicit: [], scanPorts: parsePortRange("9778-9785") });
    expect(r.devices.map((d) => d.info.id)).toEqual([E17.id, AIR.id]);
    expect(r.devices[1]).toMatchObject({ url: "http://127.0.0.1:9779", projectRoot: WT });
    expect(r.unreachable).toEqual([]);
    expect(bridgeGetMock).toHaveBeenCalledWith("/device", "http://127.0.0.1:9785", {
      timeoutMs: expect.any(Number),
    });
  });

  it("reports unreachable explicit URLs and refusing bridges, dedupes localhost", async () => {
    serveBridges({
      "http://localhost:9778": ok(E17),
      "http://127.0.0.1:9779": { ok: false, error: "Unauthorized" },
    });
    const r = await discoverDevices({
      explicit: [{ url: "http://localhost:9778", alias: "main" }, { url: "http://10.0.0.9:9778" }],
      scanPorts: [9778, 9779, 9780],
    });
    expect(r.devices).toHaveLength(1);
    expect(r.devices[0]).toMatchObject({ alias: "main", explicit: true });
    expect(r.unreachable.map((u) => u.url)).toEqual([
      "http://10.0.0.9:9778",
      "http://127.0.0.1:9779",
    ]);
    expect(bridgeGetMock).not.toHaveBeenCalledWith("/device", "http://127.0.0.1:9778", expect.anything());
  });
});

describe("selectors", () => {
  const entries: ResolvedEntry[] = [
    { url: "http://127.0.0.1:9778", info: E17, projectRoot: MAIN },
    { url: "http://127.0.0.1:9779", info: AIR, projectRoot: WT, alias: "air" },
    { url: "http://127.0.0.1:9790", info: { ...E17B, platform: "android" }, projectRoot: MAIN },
  ];

  it("lists selectors per entry", () => {
    expect(selectorsFor(entries[1])).toEqual([
      "metro:8095",
      "bridge:9779",
      "name:iPhone Air",
      `project:${WT}`,
      "air",
      AIR.id,
    ]);
  });

  it("matches metro, bridge, name, project, id, alias and bare names", () => {
    const ids = (sel: string) => matchSelector(entries, sel).map((e) => e.info.id);
    expect(ids("metro:8095")).toEqual([AIR.id]);
    expect(ids("bridge:9790")).toEqual([E17B.id]);
    expect(ids("port:9778")).toEqual([E17.id]);
    expect(ids("name:iphone air")).toEqual([AIR.id]);
    expect(ids("iPhone Air")).toEqual([AIR.id]);
    expect(ids("name:iPhone 17e")).toEqual([E17.id, E17B.id]);
    expect(ids(`project:${WT}/`)).toEqual([AIR.id]);
    expect(ids(`project:${MAIN}`)).toEqual([E17.id, E17B.id]);
    expect(ids("air")).toEqual([AIR.id]);
    expect(ids(E17.id)).toEqual([E17.id]);
    expect(ids("metro:9999")).toEqual([]);
  });

  it("rejects a non-numeric port selector", () => {
    expect(() => matchSelector(entries, "metro:abc")).toThrow(/expected a port/);
  });
});

describe("resolveDevice with discovery", () => {
  beforeEach(() => {
    vi.stubEnv("EXPO_STATE_MCP_PORT_RANGE", "9778-9781");
    serveBridges({
      "http://127.0.0.1:9778": ok(E17),
      "http://127.0.0.1:9779": ok(AIR),
      "http://127.0.0.1:9780": ok(E17B),
    });
  });

  it("refuses to guess between several bridges and lists selectors", async () => {
    const err = await resolveDevice().catch((e: Error) => e.message);
    expect(err).toMatch(/Multiple bridges \(3\)/);
    expect(err).toContain("metro:8095");
    expect(err).toContain("bridge:9779");
  });

  it("picks by metro port from the device argument", async () => {
    const r = await resolveDevice("metro:8095");
    expect(r.url).toBe("http://127.0.0.1:9779");
    expect(r.info.deviceName).toBe("iPhone Air");
  });

  it("honors EXPO_STATE_MCP_METRO_PORT", async () => {
    vi.stubEnv("EXPO_STATE_MCP_METRO_PORT", "8083");
    expect((await resolveDevice()).info.id).toBe(E17B.id);
  });

  it("prefers EXPO_STATE_MCP_DEFAULT_DEVICE over METRO_PORT, and the argument over both", async () => {
    vi.stubEnv("EXPO_STATE_MCP_METRO_PORT", "8083");
    vi.stubEnv("EXPO_STATE_MCP_DEFAULT_DEVICE", "name:iPhone Air");
    expect((await resolveDevice()).info.id).toBe(AIR.id);
    expect((await resolveDevice("bridge:9778")).info.id).toBe(E17.id);
  });

  it("errors on an ambiguous selector", async () => {
    await expect(resolveDevice("name:iPhone 17e")).rejects.toThrow(/matches 2 devices/);
  });

  it("re-probes a cached registry once when the selector misses (app moved port)", async () => {
    await getRegistry();
    const MOVED = dev("ios-26-iphone-air-sim-d4", { deviceName: "iPhone Air", metroPort: 8096 });
    serveBridges({ "http://127.0.0.1:9781": ok(MOVED) });
    const r = await resolveDevice("metro:8096");
    expect(r.url).toBe("http://127.0.0.1:9781");
  });

  it("reports when no bridge is running", async () => {
    serveBridges({});
    await expect(resolveDevice()).rejects.toThrow(/No expo-state-mcp bridge found/);
  });
});
