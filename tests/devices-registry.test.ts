import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseBridgeEntries,
  resetDeviceRegistryForTests,
} from "../src/cli/devices";

describe("parseBridgeEntries", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetDeviceRegistryForTests();
  });

  it("uses EXPO_STATE_MCP_BRIDGE_URL when BRIDGES unset", () => {
    vi.stubEnv("EXPO_STATE_MCP_BRIDGES", "");
    vi.stubEnv("EXPO_STATE_MCP_BRIDGE_URL", "http://192.168.1.5:9778/");
    expect(parseBridgeEntries()).toEqual([
      { url: "http://192.168.1.5:9778" },
    ]);
  });

  it("defaults to loopback when both unset", () => {
    vi.unstubAllEnvs();
    delete process.env.EXPO_STATE_MCP_BRIDGES;
    delete process.env.EXPO_STATE_MCP_BRIDGE_URL;
    expect(parseBridgeEntries()).toEqual([{ url: "http://127.0.0.1:9778" }]);
  });

  it("parses comma-separated URLs", () => {
    vi.stubEnv(
      "EXPO_STATE_MCP_BRIDGES",
      "http://127.0.0.1:9778, http://127.0.0.1:9779 ",
    );
    expect(parseBridgeEntries()).toEqual([
      { url: "http://127.0.0.1:9778" },
      { url: "http://127.0.0.1:9779" },
    ]);
  });

  it("parses JSON array of objects and strings", () => {
    vi.stubEnv(
      "EXPO_STATE_MCP_BRIDGES",
      JSON.stringify([
        "http://a:1",
        { url: "http://b:2", alias: "beta" },
        { url: "http://c:3" },
      ]),
    );
    expect(parseBridgeEntries()).toEqual([
      { url: "http://a:1" },
      { url: "http://b:2", alias: "beta" },
      { url: "http://c:3" },
    ]);
  });

  it("throws on invalid JSON", () => {
    vi.stubEnv("EXPO_STATE_MCP_BRIDGES", "[not-json");
    expect(() => parseBridgeEntries()).toThrow(/invalid JSON/);
  });
});
