// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Comments and test names in the code read as project documentation: no dated process tags such
// as "batch 4" or "(review)". A comment says what the code does and why, with the decision record
// where one applies.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(import.meta.dirname, "../../..");
const SKIP = new Set(["node_modules", "target", "dist", "wasm", "generated", "gen", "proptest-regressions"]);
const SOURCE = /\.(rs|ts|js|mjs|svelte|html|css)$/;
const TAG = /batch [0-9]|\(review|\(reviewed/i;

function sources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (SKIP.has(e.name)) return [];
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sources(p);
    return SOURCE.test(e.name) ? [p] : [];
  });
}

test("no process tags in the code's comments and test names", () => {
  const files = ["crates", "packages", "apps"].flatMap((d) => sources(path.join(root, d)));
  assert.ok(files.length > 200, `found ${files.length} files`);
  const found = files
    .filter((f) => f !== import.meta.filename)
    .flatMap((f) =>
      fs
        .readFileSync(f, "utf8")
        .split("\n")
        .flatMap((line, n) => (TAG.test(line) ? [`${path.relative(root, f)}:${n + 1}`] : [])),
    );
  assert.deepEqual(found, []);
});
