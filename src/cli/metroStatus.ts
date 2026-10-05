const STATUS_TIMEOUT_MS = 800;

/** Hosts the app may use for Metro that the dev machine reaches as loopback. */
const LOOPBACK_ALIASES = new Set([
  "127.0.0.1",
  "localhost",
  "10.0.2.2", // Android emulator -> host
  "10.0.3.2", // Genymotion -> host
  "::1",
  "[::1]",
]);

/** Map the app-side Metro host to one this machine can reach. */
export function hostReachableFromMachine(host: string): string {
  return LOOPBACK_ALIASES.has(host.toLowerCase()) ? "127.0.0.1" : host;
}

/**
 * Ask Metro for its project root (`X-React-Native-Project-Root` on `GET /status`, set by Expo CLI and
 * the RN community CLI). Returns `undefined` when Metro is unreachable or is not Metro.
 */
export async function fetchMetroProjectRoot(
  host: string,
  port: number,
  timeoutMs = STATUS_TIMEOUT_MS,
): Promise<string | undefined> {
  const h = hostReachableFromMachine(host);
  const hostPart = h.includes(":") && !h.startsWith("[") ? `[${h}]` : h;
  try {
    const res = await fetch(`http://${hostPart}:${port}/status`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await res.text();
    if (!body.startsWith("packager-status:running")) return undefined;
    const raw = res.headers.get("x-react-native-project-root");
    if (!raw) return undefined;
    try {
      return decodeURI(raw);
    } catch {
      return raw;
    }
  } catch {
    return undefined;
  }
}
