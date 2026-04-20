/** Get value at dot path (e.g. `a.b.c`). */
export function getAtPath(root: unknown, path: string | undefined | null): unknown {
  if (path == null || path === "") return root;
  const parts = path.split(".").filter(Boolean);
  let cur: unknown = root;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== "object") {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** Set / merge value at dot path on a cloned object tree. Returns new root. */
export function setAtPath(
  root: Record<string, unknown>,
  path: string,
  value: unknown,
  mode: "merge" | "set",
): Record<string, unknown> {
  const parts = path.split(".").filter(Boolean);
  if (parts.length === 0) {
    if (mode === "merge" && root !== null && typeof root === "object" && value !== null && typeof value === "object" && !Array.isArray(value)) {
      return { ...root, ...(value as Record<string, unknown>) };
    }
    return value as Record<string, unknown>;
  }

  const next = { ...root };
  let cur: Record<string, unknown> = next;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const child = cur[key];
    const childObj =
      child !== null && typeof child === "object" && !Array.isArray(child)
        ? { ...(child as Record<string, unknown>) }
        : {};
    cur[key] = childObj;
    cur = childObj;
  }

  const last = parts[parts.length - 1];
  if (mode === "merge" && cur[last] !== null && typeof cur[last] === "object" && value !== null && typeof value === "object" && !Array.isArray(value)) {
    cur[last] = { ...(cur[last] as Record<string, unknown>), ...(value as Record<string, unknown>) };
  } else {
    cur[last] = value as unknown;
  }
  return next;
}
