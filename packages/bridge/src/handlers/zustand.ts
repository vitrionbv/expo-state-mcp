import type { BridgeContext, ApiResult, StoreMap } from "../types";
import { getAtPath, setAtPath } from "../util/path";

function sanitizeForJson(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "function") return undefined;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeForJson(v)).filter((v) => v !== undefined);
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "function") continue;
    out[k] = sanitizeForJson(v);
  }
  return out;
}

function getStore(stores: StoreMap, name: string | undefined) {
  if (!name) return null;
  return stores[name] ?? null;
}

export function handleZustandStores(ctx: BridgeContext): ApiResult<{ names: string[] }> {
  return { ok: true, data: { names: Object.keys(ctx.stores).sort() } };
}

export function handleZustandGet(
  ctx: BridgeContext,
  name: string | undefined,
  path: string | undefined,
): ApiResult<unknown> {
  const store = getStore(ctx.stores, name);
  if (!store) {
    return { ok: false, error: `Unknown store: ${name ?? ""}` };
  }
  const state = store.getState() as Record<string, unknown>;
  const raw = getAtPath(state, path);
  return { ok: true, data: sanitizeForJson(raw) };
}

export function handleZustandSet(
  ctx: BridgeContext,
  body: {
    name?: string;
    path?: string;
    value?: unknown;
    mode?: "merge" | "set";
  },
): ApiResult<{ updated: boolean }> {
  const store = getStore(ctx.stores, body.name);
  if (!store) {
    return { ok: false, error: `Unknown store: ${body.name ?? ""}` };
  }
  const mode = body.mode ?? "merge";
  const path = body.path ?? "";

  try {
    if (!path) {
      if (mode === "set") {
        store.setState(body.value as never);
      } else {
        const cur = store.getState() as Record<string, unknown>;
        const nextVal = body.value;
        if (
          cur !== null &&
          typeof cur === "object" &&
          nextVal !== null &&
          typeof nextVal === "object" &&
          !Array.isArray(nextVal)
        ) {
          store.setState({ ...(cur as object), ...(nextVal as object) } as never);
        } else {
          store.setState(body.value as never);
        }
      }
    } else {
      const cur = store.getState() as Record<string, unknown>;
      const merged = setAtPath({ ...cur }, path, body.value, mode);
      store.setState(merged as never);
    }
    return { ok: true, data: { updated: true } };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export function handleZustandCall(
  ctx: BridgeContext,
  body: { name?: string; action?: string; args?: unknown[] },
): ApiResult<unknown> {
  const store = getStore(ctx.stores, body.name);
  if (!store) {
    return { ok: false, error: `Unknown store: ${body.name ?? ""}` };
  }
  const action = body.action;
  if (!action || typeof action !== "string") {
    return { ok: false, error: "Missing action" };
  }
  const args = Array.isArray(body.args) ? body.args : [];
  try {
    const st = store.getState() as Record<string, unknown>;
    const fn = st[action];
    if (typeof fn !== "function") {
      return { ok: false, error: `Not a function: ${action}` };
    }
    const result = (fn as (...a: unknown[]) => unknown).apply(st, args);
    if (result instanceof Promise) {
      return { ok: false, error: "Async actions not supported via call; await in app or use sync action" };
    }
    return { ok: true, data: sanitizeForJson(result) };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
