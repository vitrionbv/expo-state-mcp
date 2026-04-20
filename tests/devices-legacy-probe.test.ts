import { afterEach, describe, expect, it, vi } from "vitest";
import { bridgeGet } from "../src/cli/bridgeClient.js";
import {
  listResolvedDevices,
  resetDeviceRegistryForTests,
} from "../src/cli/devices";

vi.mock("../src/cli/bridgeClient.js", () => ({
  bridgeGet: vi.fn(),
}));

const bridgeGetMock = vi.mocked(bridgeGet);

describe("listResolvedDevices legacy /health fallback", () => {
  afterEach(() => {
    resetDeviceRegistryForTests();
    vi.unstubAllEnvs();
    bridgeGetMock.mockReset();
  });

  it("uses /health when /device is missing (older bridge)", async () => {
    vi.stubEnv("EXPO_STATE_MCP_BRIDGE_URL", "http://127.0.0.1:9778");
    delete process.env.EXPO_STATE_MCP_BRIDGES;
    bridgeGetMock
      .mockResolvedValueOnce({
        ok: false,
        error: "Not found: GET /device",
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          appName: "legacy-app",
          dbPath: "/data/db.sqlite",
          server: { port: 9778, host: "127.0.0.1" },
          stores: [],
        },
      });

    const entries = await listResolvedDevices(true);
    expect(entries).toHaveLength(1);
    expect(entries[0].info.id).toMatch(/^legacy-/);
    expect(entries[0].info.appName).toBe("legacy-app");
    expect(bridgeGetMock).toHaveBeenCalledWith("/device", "http://127.0.0.1:9778");
    expect(bridgeGetMock).toHaveBeenCalledWith("/health", "http://127.0.0.1:9778");
  });
});
