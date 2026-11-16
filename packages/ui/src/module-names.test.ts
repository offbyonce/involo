// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";

/** Every source file, by path (the files are not loaded). */
const FILES = Object.keys(import.meta.glob("./**/*.{ts,svelte}"));

/** The name a file is imported by: "x.svelte.ts" and "x.ts" drop ".ts", as imports write them. */
const importName = (path: string) => path.replace(/\.ts$/, "").toLowerCase();

describe("module names", () => {
  it("never has two files that import by the same name on a case-insensitive disk", () => {
    // Windows and macOS: "./tour.svelte" (tour.svelte.ts) found Tour.svelte instead, and CI failed
    // there only (the tour, 2026-11-16).
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const f of FILES) {
      const k = importName(f);
      const other = seen.get(k);
      if (other) clashes.push(`${other} / ${f}`);
      else seen.set(k, f);
    }
    expect(clashes).toEqual([]);
  });

  it("catches the clash it is for", () => {
    expect(importName("./lib/tour.svelte.ts")).toBe(importName("./lib/Tour.svelte"));
  });
});
