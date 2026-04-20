const DEFAULT_BASE = "http://127.0.0.1:9778";
const TIMEOUT_MS = 10_000;

function resolvedBase(bridgeBaseUrl?: string): string {
  return (
    bridgeBaseUrl ??
    process.env.EXPO_STATE_MCP_BRIDGE_URL ??
    DEFAULT_BASE
  ).replace(/\/+$/, "");
}

function headers(): Headers {
  const h = new Headers();
  h.set("Accept", "application/json");
  h.set("Content-Type", "application/json");
  const token = process.env.EXPO_STATE_MCP_TOKEN;
  if (token) {
    h.set("Authorization", `Bearer ${token}`);
  }
  return h;
}

export async function bridgeGet(
  pathAndQuery: string,
  bridgeBaseUrl?: string,
): Promise<unknown> {
  const base = resolvedBase(bridgeBaseUrl);
  const ctrl = AbortSignal.timeout(TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${base}${pathAndQuery}`, {
      method: "GET",
      headers: headers(),
      signal: ctrl,
    });
  } catch (e) {
    throw new Error(
      `Bridge unreachable at ${base} — is the app running with setupBridge()? (${String(e)})`,
      { cause: e },
    );
  }
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    throw new Error(
      `Expected JSON from bridge, got HTTP ${res.status}: ${text.slice(0, 400)}`,
    );
  }
  return data;
}

export async function bridgePost(
  path: string,
  body: unknown,
  bridgeBaseUrl?: string,
): Promise<unknown> {
  const base = resolvedBase(bridgeBaseUrl);
  const ctrl = AbortSignal.timeout(TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body ?? {}),
      signal: ctrl,
    });
  } catch (e) {
    throw new Error(
      `Bridge unreachable at ${base} — is the app running with setupBridge()? (${String(e)})`,
      { cause: e },
    );
  }
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    throw new Error(
      `Expected JSON from bridge, got HTTP ${res.status}: ${text.slice(0, 400)}`,
    );
  }
  return data;
}
