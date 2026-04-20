const DEFAULT_BASE = "http://127.0.0.1:9778";
const TIMEOUT_MS = 10_000;

function baseUrl(): string {
  return process.env.EXPO_STATE_MCP_BRIDGE_URL ?? DEFAULT_BASE;
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

export async function bridgeGet(pathAndQuery: string): Promise<unknown> {
  const ctrl = AbortSignal.timeout(TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${pathAndQuery}`, {
      method: "GET",
      headers: headers(),
      signal: ctrl,
    });
  } catch (e) {
    throw new Error(
      `Bridge unreachable at ${baseUrl()} — is the app running with setupBridge()? (${String(e)})`,
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

export async function bridgePost(path: string, body: unknown): Promise<unknown> {
  const ctrl = AbortSignal.timeout(TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body ?? {}),
      signal: ctrl,
    });
  } catch (e) {
    throw new Error(
      `Bridge unreachable at ${baseUrl()} — is the app running with setupBridge()? (${String(e)})`,
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
