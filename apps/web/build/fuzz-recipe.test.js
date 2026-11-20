// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// `just fuzz` builds the fuzz targets for the machine it runs on. cargo-fuzz builds for the target
// it was itself built for unless told otherwise, and the prebuilt cargo-fuzz CI installs is a musl
// build: the targets then failed to build ("can't find crate for `std`", "sanitizer is
// incompatible with statically linked libc"). So the recipe names the target: rustc's host tuple.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(import.meta.dirname, "../../..");

/** The body of the justfile's `fuzz` recipe. */
function fuzzRecipe() {
  const lines = fs.readFileSync(path.join(root, "justfile"), "utf8").split("\n");
  const start = lines.findIndex((l) => l.startsWith("fuzz "));
  assert.ok(start >= 0, "the justfile has a fuzz recipe");
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith("    ")) break;
    body.push(line.trim());
  }
  return body;
}

test("just fuzz builds the targets for this machine, not for the target cargo-fuzz was built for", () => {
  const run = fuzzRecipe().find((l) => l.includes("cargo +nightly fuzz run"));
  assert.ok(run, "the recipe runs cargo fuzz");
  assert.match(run, /fuzz run --target \{\{ `rustc \+nightly --print host-tuple` \}\} /);
});
