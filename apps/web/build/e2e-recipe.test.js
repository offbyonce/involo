// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// `just e2e` builds everything the end-to-end suite reads, so it passes on a clean checkout: each
// built folder the suite or its scenes read has a recipe that `just e2e` depends on.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(import.meta.dirname, "../../..");
const web = path.join(root, "apps/web");

/** The built folders the suite can read, and the recipe that builds each one. */
const BUILT = {
  "apps/web/dist": "site",
  "target/test-packs": "test-packs",
};

/** The recipes `just e2e` depends on. */
function e2eDependencies() {
  const line = fs
    .readFileSync(path.join(root, "justfile"), "utf8")
    .split("\n")
    .find((l) => l.startsWith("e2e "));
  assert.ok(line, "the justfile has an e2e recipe");
  return line
    .slice(line.indexOf(":") + 1)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** The suite's own files and the scenes module it imports. */
function suiteFiles() {
  const e2e = path.join(web, "e2e");
  return [
    ...fs.readdirSync(e2e).map((f) => path.join(e2e, f)),
    path.join(web, "playwright.config.ts"),
    path.join(web, "build/scenes.mjs"),
  ].filter((f) => fs.statSync(f).isFile());
}

/** The built folders a file reads, from the paths it names. */
function reads(file) {
  const text = fs.readFileSync(file, "utf8");
  const found = new Set();
  if (/"\.\.\/dist"|"dist"|apps\/web\/dist/.test(text)) found.add("apps/web/dist");
  for (const m of text.matchAll(/target\/([\w-]+)/g)) found.add(`target/${m[1]}`);
  return found;
}

test("just e2e builds every built folder the suite reads", () => {
  const deps = e2eDependencies();
  for (const file of suiteFiles()) {
    for (const dir of reads(file)) {
      // Output folders the run writes (its results and report) need no recipe.
      if (dir === "target/e2e") continue;
      const recipe = BUILT[dir];
      assert.ok(recipe, `${path.relative(root, file)} reads ${dir}: add the recipe that builds it to BUILT`);
      assert.ok(
        deps.includes(recipe),
        `${path.relative(root, file)} reads ${dir}, but \`just e2e\` doesn't depend on \`just ${recipe}\``,
      );
    }
  }
});

test("the suite reads the site and the test packs", () => {
  const all = new Set(suiteFiles().flatMap((f) => [...reads(f)]));
  assert.ok(all.has("apps/web/dist"), "the suite serves the built site");
  assert.ok(all.has("target/test-packs"), "the scenes read the example pack's built file");
});
