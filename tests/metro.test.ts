import { afterEach, describe, expect, it, vi } from "vitest";
import { parseMetroUrl } from "../src/app/util/metro";
import {
  fetchMetroProjectRoot,
  hostReachableFromMachine,
} from "../src/cli/metroStatus";

describe("parseMetroUrl", () => {
  it("parses an iOS simulator bundle URL", () => {
    expect(
      parseMetroUrl(
        "http://127.0.0.1:8095/index.bundle?platform=ios&dev=true&minify=false",
      ),
    ).toEqual({ url: "http://127.0.0.1:8095", host: "127.0.0.1", port: 8095 });
  });

  it("parses Android emulator and LAN hosts", () => {
    expect(parseMetroUrl("http://10.0.2.2:8081/index.bundle")?.port).toBe(8081);
    expect(parseMetroUrl("http://192.168.1.20:8090/x")?.host).toBe("192.168.1.20");
  });

  it("defaults the port from the scheme", () => {
    expect(parseMetroUrl("https://tunnel.example.com/index.bundle")).toEqual({
      url: "https://tunnel.example.com:443",
      host: "tunnel.example.com",
      port: 443,
    });
  });

  it("handles IPv6 literals", () => {
    expect(parseMetroUrl("http://[::1]:8081/index.bundle")?.host).toBe("[::1]");
  });

  it("returns null for embedded bundles and junk", () => {
    expect(parseMetroUrl("file:///var/containers/main.jsbundle")).toBeNull();
    expect(parseMetroUrl("")).toBeNull();
    expect(parseMetroUrl(undefined)).toBeNull();
    expect(parseMetroUrl(null)).toBeNull();
  });
});

describe("hostReachableFromMachine", () => {
  it("maps emulator and localhost aliases to loopback", () => {
    expect(hostReachableFromMachine("10.0.2.2")).toBe("127.0.0.1");
    expect(hostReachableFromMachine("localhost")).toBe("127.0.0.1");
    expect(hostReachableFromMachine("[::1]")).toBe("127.0.0.1");
    expect(hostReachableFromMachine("192.168.1.20")).toBe("192.168.1.20");
  });
});

describe("fetchMetroProjectRoot", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the decoded project root from a running Metro", async () => {
    const fetchMock = vi.fn(async () =>
      new Response("packager-status:running", {
        headers: { "X-React-Native-Project-Root": encodeURI("/Users/me/my app") },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchMetroProjectRoot("10.0.2.2", 8095)).resolves.toBe("/Users/me/my app");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8095/status",
      expect.anything(),
    );
  });

  it("ignores servers that are not Metro", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("hello", { headers: { "X-React-Native-Project-Root": "/x" } }),
      ),
    );
    await expect(fetchMetroProjectRoot("127.0.0.1", 8099)).resolves.toBeUndefined();
  });

  it("returns undefined when Metro is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    await expect(fetchMetroProjectRoot("127.0.0.1", 8081)).resolves.toBeUndefined();
  });
});
