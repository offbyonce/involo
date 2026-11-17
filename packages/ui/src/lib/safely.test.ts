// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { safely } from "./safely";

/** Every source file under packages/ui/src with its text, tests left out. */
const SOURCES = Object.entries(
  import.meta.glob<string>(["../**/*.{ts,svelte}", "!../**/*.test.ts"], {
    query: "?raw",
    import: "default",
    eager: true,
  }),
);

describe("safely", () => {
  it("passes the value on, and sends a failure of the promise or of the handler to `failed`", async () => {
    const got: unknown[] = [];
    safely(Promise.resolve(1), (v) => got.push(v));
    safely(
      Promise.reject(new Error("no")),
      () => got.push("never"),
      (e) => got.push((e as Error).message),
    );
    safely(
      Promise.resolve(2),
      () => {
        throw new Error("handler");
      },
      (e) => got.push((e as Error).message),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(got.sort()).toEqual([1, "handler", "no"]);
  });

  it("reports a failure on the console by default, never unhandled", async () => {
    const report = vi.spyOn(console, "error").mockImplementation(() => {});
    safely(Promise.reject(new Error("lost")), () => {});
    await new Promise((r) => setTimeout(r, 0));
    expect(report).toHaveBeenCalled();
    report.mockRestore();
  });

  it("is the only place in the interface's source that calls .then(, so every chain has a rejection path", () => {
    expect(SOURCES.length).toBeGreaterThan(50);
    const found = SOURCES.filter(([f, text]) => f !== "./safely.ts" && text.includes(".then(")).map(
      ([f]) => f,
    );
    expect(found).toEqual([]);
  });
});
