export interface MetroInfo {
  /** Origin the app loaded its bundle from, e.g. `http://127.0.0.1:8095`. */
  url: string;
  host: string;
  port: number;
}

/**
 * Parse a bundle URL (`scriptURL` / `fullBundleUrl`) into the Metro origin.
 * Uses a regex because the RN `URL` polyfill lacks `hostname` / `port` on older versions.
 * Returns `null` for embedded bundles (`file://…`) and anything that is not http(s).
 */
export function parseMetroUrl(scriptURL: string | null | undefined): MetroInfo | null {
  if (typeof scriptURL !== "string") return null;
  const m = /^(https?):\/\/(\[[^\]]+\]|[^/:?#]+)(?::(\d+))?/i.exec(scriptURL.trim());
  if (!m) return null;
  const scheme = m[1].toLowerCase();
  const host = m[2];
  const port = m[3] ? parseInt(m[3], 10) : scheme === "https" ? 443 : 80;
  if (!Number.isFinite(port)) return null;
  return { url: `${scheme}://${host}:${port}`, host, port };
}

function tryScriptUrl(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const RN = require("react-native") as {
      NativeModules?: Record<string, unknown>;
    };
    const sc = RN.NativeModules?.SourceCode as
      | { getConstants?: () => { scriptURL?: unknown }; scriptURL?: unknown }
      | undefined;
    const c = sc?.getConstants?.() ?? sc;
    if (typeof c?.scriptURL === "string") return c.scriptURL;
  } catch {
    /* fall through */
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native/Libraries/Core/Devtools/getDevServer") as
      | (() => { url?: string; fullBundleUrl?: string })
      | { default?: () => { url?: string; fullBundleUrl?: string } };
    const fn = typeof mod === "function" ? mod : mod.default;
    const r = fn?.();
    return r?.fullBundleUrl ?? r?.url;
  } catch {
    return undefined;
  }
}

/** Metro origin of the running bundle, or `null` (embedded bundle / unknown). */
export function collectMetroInfo(): MetroInfo | null {
  return parseMetroUrl(tryScriptUrl());
}
