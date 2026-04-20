import { tryGetLanIPv4 } from "./ip";

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

/** Lowercase slug segment for device id (alphanumeric + dashes). */
export function slugPart(s: string | undefined | null): string {
  if (s == null || s === "") return "";
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export interface DeviceInfoInput {
  platformOS: string;
  platformVersion?: string | number;
  appName?: string;
  constantsDeviceName?: string;
  deviceModelName?: string;
  deviceOsBuildId?: string;
  deviceIsDevice?: boolean;
  deviceBrand?: string;
  lanIp?: string;
  /** Four hex chars for deterministic tests; otherwise random. */
  idSuffix?: string;
}

/**
 * Build device identity from collected fields (pure; used by tests and collectDeviceInfo).
 */
export function buildDeviceInfoFrom(input: DeviceInfoInput): DeviceInfo {
  const os = slugPart(
    input.platformVersion != null ? String(input.platformVersion) : "",
  );
  const model = slugPart(
    input.deviceModelName ??
      input.constantsDeviceName ??
      input.deviceOsBuildId,
  );
  let kind = "unknown";
  if (input.deviceIsDevice === true) kind = "device";
  else if (input.deviceIsDevice === false) kind = "sim";

  const baseParts = [slugPart(input.platformOS), os, model, kind].filter(
    (p) => p.length > 0,
  );
  const base = baseParts.length > 0 ? baseParts.join("-") : "unknown";
  const suffix =
    input.idSuffix ??
    Math.floor(Math.random() * 0xffff)
      .toString(16)
      .padStart(4, "0");
  const id = `${base}-${suffix}`.replace(/-+/g, "-").replace(/^-|-$/g, "");

  return {
    id,
    appName: input.appName,
    platform: input.platformOS,
    osVersion:
      input.platformVersion != null ? String(input.platformVersion) : undefined,
    model: input.deviceModelName,
    brand: input.deviceBrand,
    deviceName: input.constantsDeviceName,
    isPhysicalDevice: input.deviceIsDevice,
    lanIp: input.lanIp,
  };
}

function tryExpoConstants(): {
  deviceName?: string;
} {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require("expo-constants") as {
      default?: { deviceName?: string };
      deviceName?: string;
    };
    const c = Constants.default ?? Constants;
    return { deviceName: c.deviceName };
  } catch {
    return {};
  }
}

function tryExpoDevice(): {
  modelName?: string;
  osBuildId?: string;
  isDevice?: boolean;
  brand?: string;
} {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ExpoDevice = require("expo-device") as {
      modelName?: string | null;
      osBuildId?: string | null;
      isDevice?: boolean | null;
      brand?: string | null;
    };
    return {
      modelName: ExpoDevice.modelName ?? undefined,
      osBuildId: ExpoDevice.osBuildId ?? undefined,
      isDevice: ExpoDevice.isDevice ?? undefined,
      brand: ExpoDevice.brand ?? undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Collect device info for the running bridge (React Native / Expo).
 */
export async function collectDeviceInfo(appName?: string): Promise<DeviceInfo> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Platform } = require("react-native") as {
    Platform: { OS: string; Version: string | number };
  };

  const { deviceName: constantsDeviceName } = tryExpoConstants();
  const {
    modelName: deviceModelName,
    osBuildId: deviceOsBuildId,
    isDevice: deviceIsDevice,
    brand: deviceBrand,
  } = tryExpoDevice();

  const lanIp = await tryGetLanIPv4();

  return buildDeviceInfoFrom({
    platformOS: Platform.OS,
    platformVersion: Platform.Version,
    appName,
    constantsDeviceName,
    deviceModelName: deviceModelName ?? undefined,
    deviceOsBuildId: deviceOsBuildId ?? undefined,
    deviceIsDevice: deviceIsDevice ?? undefined,
    deviceBrand: deviceBrand ?? undefined,
    lanIp,
  });
}
