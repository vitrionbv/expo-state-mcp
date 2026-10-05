import { describe, expect, it, vi } from "vitest";
import {
  listenWithFallback,
  portCandidates,
  type ListenableServer,
} from "../src/app/util/listen";

/** Fake tcp-socket server: ports in `taken` emit `error` async, others `listening`. */
function fakeFactory(taken: Set<number>, hang = new Set<number>()) {
  const created: FakeServer[] = [];
  class FakeServer implements ListenableServer {
    handlers: Record<string, Array<(...a: unknown[]) => void>> = {};
    closed = false;
    port?: number;
    on(ev: string, fn: (...a: unknown[]) => void) {
      (this.handlers[ev] ??= []).push(fn);
    }
    listen(opts: { port: number; host?: string }, cb?: () => void) {
      this.port = opts.port;
      if (hang.has(opts.port)) return;
      setTimeout(() => {
        if (taken.has(opts.port)) {
          this.close();
          this.handlers.error?.forEach((h) => h("Address already in use"));
        } else {
          cb?.();
        }
      }, 0);
    }
    close() {
      this.closed = true;
    }
  }
  return {
    created,
    createServer: () => {
      const s = new FakeServer();
      created.push(s);
      return s;
    },
  };
}

describe("portCandidates", () => {
  it("builds an inclusive range", () => {
    expect(portCandidates(9778, 3)).toEqual([9778, 9779, 9780]);
    expect(portCandidates(9778, 0)).toEqual([9778]);
    expect(portCandidates(65534, 5)).toEqual([65534, 65535]);
  });
});

describe("listenWithFallback", () => {
  it("binds the first port when free", async () => {
    const f = fakeFactory(new Set());
    const r = await listenWithFallback({
      host: "127.0.0.1",
      ports: [9778, 9779],
      createServer: f.createServer,
    });
    expect(r.port).toBe(9778);
    expect(r.skipped).toEqual([]);
    expect(f.created).toHaveLength(1);
  });

  it("falls back to the next free port with a fresh server per attempt", async () => {
    const f = fakeFactory(new Set([9778, 9779]));
    const r = await listenWithFallback({
      host: "127.0.0.1",
      ports: portCandidates(9778, 5),
      createServer: f.createServer,
    });
    expect(r.port).toBe(9780);
    expect(r.server).toBe(f.created[2]);
    expect(f.created).toHaveLength(3);
    expect(f.created[0].closed).toBe(true);
    expect(r.skipped.map((s) => s.port)).toEqual([9778, 9779]);
    expect(r.skipped[0].reason).toContain("in use");
  });

  it("skips ports the pre-bind probe reports as in use", async () => {
    const f = fakeFactory(new Set());
    const isPortInUse = vi.fn(async (p: number) => p === 9778);
    const r = await listenWithFallback({
      host: "0.0.0.0",
      ports: [9778, 9779],
      createServer: f.createServer,
      isPortInUse,
    });
    expect(r.port).toBe(9779);
    expect(f.created).toHaveLength(1);
    expect(r.skipped[0].reason).toMatch(/already answers/);
  });

  it("treats a throwing probe as free", async () => {
    const f = fakeFactory(new Set());
    const r = await listenWithFallback({
      host: "127.0.0.1",
      ports: [9778],
      createServer: f.createServer,
      isPortInUse: async () => {
        throw new Error("boom");
      },
    });
    expect(r.port).toBe(9778);
  });

  it("moves on when listen never settles", async () => {
    const f = fakeFactory(new Set(), new Set([9778]));
    const r = await listenWithFallback({
      host: "127.0.0.1",
      ports: [9778, 9779],
      createServer: f.createServer,
      timeoutMs: 20,
    });
    expect(r.port).toBe(9779);
    expect(r.skipped[0].reason).toMatch(/timed out/);
  });

  it("throws with every reason when all ports fail", async () => {
    const f = fakeFactory(new Set([9778, 9779]));
    await expect(
      listenWithFallback({
        host: "127.0.0.1",
        ports: [9778, 9779],
        createServer: f.createServer,
      }),
    ).rejects.toThrow(/No free bridge port on 127.0.0.1 \(9778: .*; 9779: /);
  });
});
