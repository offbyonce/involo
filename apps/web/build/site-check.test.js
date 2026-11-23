// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { catalogProblems } from "./site-check.js";

const pack = JSON.stringify({ manifest: { id: "demo", contentHash: "c0ffee".repeat(10) } });
const entry = {
  id: "demo",
  version: "0.1.0",
  aircraft: { name: "Demo" },
  engine: ">=0.1.0",
  size: pack.length,
  sha256: createHash("sha256").update(pack).digest("hex"),
};

/** A built site in a temporary folder: the app, its worker, and the catalog. */
function site(more = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "involo-site-"));
  const files = {
    "index.html": "app",
    "sw.js": 'const FILES = ["assets/app-1.js","index.html"];',
    "assets/app-1.js": "code",
    "packs/index.json": JSON.stringify([entry]),
    "packs/demo-0.1.0.involo-pack": pack,
    ...more,
  };
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  return root;
}

test("a site with its catalog under packs/ and nothing else passes", () => {
  assert.deepEqual(catalogProblems(site()), []);
});

test("a pack in the app's code or the precache list fails", () => {
  assert.deepEqual(catalogProblems(site({ "assets/app-1.js": `const P = ${pack};` })), [
    "assets/app-1.js holds demo-0.1.0.involo-pack",
  ]);
  assert.deepEqual(
    catalogProblems(site({ "sw.js": 'const FILES = ["index.html","packs/demo-0.1.0.involo-pack"];' })),
    ["the service worker precaches the pack catalog"],
  );
});

test("a file that doesn't match its entry, or isn't listed, fails", () => {
  assert.deepEqual(catalogProblems(site({ "packs/demo-0.1.0.involo-pack": `${pack} ` })), [
    `packs/demo-0.1.0.involo-pack is ${pack.length + 1} bytes, not ${pack.length}`,
    "packs/demo-0.1.0.involo-pack does not match its SHA-256",
  ]);
  assert.deepEqual(catalogProblems(site({ "packs/old.json": "{}" })), [
    "packs/old.json is not in the catalog",
  ]);
  assert.deepEqual(catalogProblems(site({ "packs/index.json": "[]" })), [
    "the catalog lists no packs",
    "packs/demo-0.1.0.involo-pack is not in the catalog",
  ]);
});
