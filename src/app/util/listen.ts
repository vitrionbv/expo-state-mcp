/** Minimal server surface shared by `react-native-tcp-socket` and test fakes. */
export interface ListenableServer {
  listen: (opts: { port: number; host?: string }, cb?: () => void) => void;
  close: (cb?: (err?: Error) => void) => void;
  on: (ev: string, fn: (...a: unknown[]) => void) => void;
}

export interface ListenWithFallbackOptions<S extends ListenableServer> {
  host: string;
  /** Ports to try, in order. */
  ports: number[];
  /** Fresh server per attempt (iOS refuses a second `listen()` on the same instance). */
  createServer: () => S;
  /** Optional pre-bind check; `true` skips the port without binding. */
  isPortInUse?: (port: number) => Promise<boolean>;
  /** Max wait for `listening` / `error` per port (default 3000 ms). */
  timeoutMs?: number;
}

export interface ListenResult<S> {
  server: S;
  port: number;
  /** Ports that were tried and skipped, with the reason. */
  skipped: Array<{ port: number; reason: string }>;
}

/** Inclusive port list `[start, start + count - 1]`, capped at 65535. */
export function portCandidates(start: number, count: number): number[] {
  const n = Math.max(1, Math.floor(count));
  const out: number[] = [];
  for (let p = start; p < start + n && p <= 65535; p++) out.push(p);
  return out;
}

function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

function tryListen<S extends ListenableServer>(
  server: S,
  port: number,
  host: string,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`timed out after ${timeoutMs} ms`));
    }, timeoutMs);

    server.on("error", (err: unknown) => {
      if (settled) {
        console.warn("[expo-state-mcp] bridge server error:", err);
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(new Error(errMessage(err)));
    });

    try {
      server.listen({ port, host }, () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      });
    } catch (e) {
      settled = true;
      clearTimeout(timer);
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

/**
 * Bind the first free port from `ports`. Any listen error (EADDRINUSE or otherwise)
 * moves on to the next port; throws when every port fails.
 */
export async function listenWithFallback<S extends ListenableServer>(
  opts: ListenWithFallbackOptions<S>,
): Promise<ListenResult<S>> {
  const timeoutMs = opts.timeoutMs ?? 3000;
  const skipped: Array<{ port: number; reason: string }> = [];

  for (const port of opts.ports) {
    if (opts.isPortInUse) {
      const inUse = await opts.isPortInUse(port).catch(() => false);
      if (inUse) {
        skipped.push({ port, reason: "in use (something already answers)" });
        continue;
      }
    }

    const server = opts.createServer();
    try {
      await tryListen(server, port, opts.host, timeoutMs);
      return { server, port, skipped };
    } catch (e) {
      skipped.push({ port, reason: errMessage(e) });
      try {
        server.close();
      } catch {
        /* already closed by the native error path */
      }
    }
  }

  const detail = skipped.map((s) => `${s.port}: ${s.reason}`).join("; ");
  throw new Error(`No free bridge port on ${opts.host} (${detail})`);
}
