import { describe, expect, it } from "vitest";
import { buildDeviceInfoFrom, slugPart } from "../src/app/util/device";

describe("slugPart", () => {
  it("slugifies segments", () => {
    expect(slugPart("iPhone 15 Pro")).toBe("iphone-15-pro");
    expect(slugPart("  Foo--Bar  ")).toBe("foo-bar");
    expect(slugPart("")).toBe("");
    expect(slugPart(null)).toBe("");
  });
});

describe("buildDeviceInfoFrom", () => {
  it("builds iOS simulator-shaped info with fixed suffix", () => {
    const d = buildDeviceInfoFrom({
      platformOS: "ios",
      platformVersion: "17.4",
      appName: "My App",
      deviceModelName: "iPhone 15 Pro",
      deviceIsDevice: false,
      idSuffix: "cafe",
    });
    expect(d.id).toBe("ios-17-4-iphone-15-pro-sim-cafe");
    expect(d.platform).toBe("ios");
    expect(d.osVersion).toBe("17.4");
    expect(d.model).toBe("iPhone 15 Pro");
    expect(d.isPhysicalDevice).toBe(false);
    expect(d.appName).toBe("My App");
  });

  it("marks physical device", () => {
    const d = buildDeviceInfoFrom({
      platformOS: "android",
      platformVersion: 34,
      deviceIsDevice: true,
      deviceBrand: "Google",
      deviceModelName: "Pixel 8",
      idSuffix: "0001",
    });
    expect(d.id).toContain("device-0001");
    expect(d.brand).toBe("Google");
    expect(d.isPhysicalDevice).toBe(true);
  });

  it("uses constants device name in slug when no model", () => {
    const d = buildDeviceInfoFrom({
      platformOS: "ios",
      platformVersion: "18.0",
      constantsDeviceName: "Dion’s iPhone",
      idSuffix: "abcd",
    });
    expect(d.deviceName).toBe("Dion’s iPhone");
    expect(d.id).toContain("dion-s-iphone");
  });

  it("falls back to os build id in slug when model and device name absent", () => {
    const d = buildDeviceInfoFrom({
      platformOS: "ios",
      platformVersion: "18.0",
      deviceOsBuildId: "build-xyz",
      idSuffix: "abcd",
    });
    expect(d.id).toContain("build-xyz");
  });

  it("uses unknown kind when isDevice undefined", () => {
    const d = buildDeviceInfoFrom({
      platformOS: "web",
      idSuffix: "beef",
    });
    expect(d.id).toContain("unknown-beef");
  });
});
