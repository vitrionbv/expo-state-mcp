import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bridgeGet } from "../src/cli/bridgeClient.js";
import {
  resetDeviceRegistryForTests,
  resolveDevice,
} from "../src/cli/devices";

vi.mock("../src/cli/bridgeClient.js", () => ({
  bridgeGet: vi.fn(),
}));

const bridgeGetMock = vi.mocked(bridgeGet);

function okDeviceBody(id: string) {
  return {
    ok: true,
    device: { id, platform: "ios", appName: "t" },
    data: { id, platform: "ios", appName: "t" },
  };
}

describe("resolveDevice", () => {
  beforeEach(() => {
    resetDeviceRegistryForTests();
    vi.unstubAllEnvs();
    bridgeGetMock.mockReset();
  });

  afterEach(() => {
    resetDeviceRegistryForTests();
    vi.unstubAllEnvs();
  });

  it("resolves single bridge without device arg", async () => {
    vi.stubEnv("EXPO_STATE_MCP_BRIDGE_URL", "http://127.0.0.1:9778");
    delete process.env.EXPO_STATE_MCP_BRIDGES;
    bridgeGetMock.mockResolvedValue(okDeviceBody("dev-one"));

    const r = await resolveDevice();
    expect(r.url).toBe("http://127.0.0.1:9778");
    expect(r.info.id).toBe("dev-one");
    expect(bridgeGetMock).toHaveBeenCalledWith("/device", "http://127.0.0.1:9778");
  });

  it("picks by device id when multiple bridges", async () => {
    vi.stubEnv(
      "EXPO_STATE_MCP_BRIDGES",
      JSON.stringify([
        { url: "http://127.0.0.1:9778" },
        { url: "http://127.0.0.1:9779", alias: "b" },
      ]),
    );
    bridgeGetMock
      .mockResolvedValueOnce(okDeviceBody("alpha"))
      .mockResolvedValueOnce(okDeviceBody("beta"));

    const r = await resolveDevice("beta");
    expect(r.url).toBe("http://127.0.0.1:9779");
    expect(r.info.id).toBe("beta");
  });

  it("picks by alias", async () => {
    vi.stubEnv(
      "EXPO_STATE_MCP_BRIDGES",
      JSON.stringify([{ url: "http://a", alias: "ios-sim" }]),
    );
    bridgeGetMock.mockResolvedValue(okDeviceBody("x1"));

    const r = await resolveDevice("ios-sim");
    expect(r.url).toBe("http://a");
  });

  it("uses EXPO_STATE_MCP_DEFAULT_DEVICE when device omitted", async () => {
    vi.stubEnv(
      "EXPO_STATE_MCP_BRIDGES",
      JSON.stringify([
        { url: "http://127.0.0.1:1" },
        { url: "http://127.0.0.1:2" },
      ]),
    );
    vi.stubEnv("EXPO_STATE_MCP_DEFAULT_DEVICE", "second-id");
    bridgeGetMock
      .mockResolvedValueOnce(okDeviceBody("first-id"))
      .mockResolvedValueOnce(okDeviceBody("second-id"));

    const r = await resolveDevice();
    expect(r.info.id).toBe("second-id");
  });

  it("throws when multiple bridges and no default", async () => {
    vi.stubEnv(
      "EXPO_STATE_MCP_BRIDGES",
      "http://127.0.0.1:1,http://127.0.0.1:2",
    );
    bridgeGetMock
      .mockResolvedValueOnce(okDeviceBody("a"))
      .mockResolvedValueOnce(okDeviceBody("b"));

    await expect(resolveDevice()).rejects.toThrow(/Multiple bridges/);
  });
});
