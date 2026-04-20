import { describe, expect, it } from "vitest";
import { getAtPath, setAtPath } from "../src/app/util/path.ts";

describe("getAtPath", () => {
  it("reads nested path", () => {
    expect(getAtPath({ a: { b: 1 } }, "a.b")).toBe(1);
  });

  it("returns root when path empty", () => {
    const o = { x: 1 };
    expect(getAtPath(o, "")).toBe(o);
    expect(getAtPath(o, null)).toBe(o);
  });

  it("rejects forbidden path segments", () => {
    expect(() => getAtPath({}, "__proto__.x")).toThrow(/Forbidden key in path/);
    expect(() => getAtPath({}, "a.prototype.b")).toThrow(/Forbidden key in path/);
  });
});

describe("setAtPath", () => {
  it("sets nested value", () => {
    const next = setAtPath({ a: { b: 0 } }, "a.b", 2, "set");
    expect(next.a).toEqual({ b: 2 });
  });

  it("rejects forbidden path segments", () => {
    expect(() => setAtPath({}, "__proto__.polluted", true, "set")).toThrow(
      /Forbidden key in path/,
    );
  });
});
