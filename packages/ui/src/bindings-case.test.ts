// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The interface reads one case (decision 0029, Names): pack files are snake_case, but the host
// hands them over with camelCase field names, and the generated types say so. A snake_case
// property in a generated type would mean the interface reads that case somewhere.

import { describe, expect, it } from "vitest";

const TYPES = Object.entries(
  import.meta.glob<string>("../../bindings/src/generated/*.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
);

describe("generated types", () => {
  it("name every property in camelCase", () => {
    expect(TYPES.length).toBeGreaterThan(50);
    const snake = TYPES.flatMap(([file, text]) =>
      // Comments can say anything; string literal values (enum names) are data.
      [
        ...text
          .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")
          .matchAll(/(?<!["\w])([a-z][a-z0-9]*_[a-z0-9_]+)\??:/g),
      ].map((m) => `${file}: ${m[1]}`),
    );
    expect(snake).toEqual([]);
  });
});
