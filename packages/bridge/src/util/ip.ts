/** Best-effort IPv4 from @react-native-community/netinfo when installed. */
export async function tryGetLanIPv4(): Promise<string | undefined> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const NetInfo = require("@react-native-community/netinfo") as {
      fetch: () => Promise<{ details?: { ipAddress?: string } | null }>;
    };
    const state = await NetInfo.fetch();
    const details = state.details as { ipAddress?: string } | null | undefined;
    if (details?.ipAddress && /^[\d.]+$/.test(details.ipAddress)) {
      return details.ipAddress;
    }
  } catch {
    /* optional dep */
  }
  return undefined;
}
