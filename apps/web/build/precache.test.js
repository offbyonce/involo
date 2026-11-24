// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { RETIRED_WORKER, WORKER, writeServiceWorker } from "./precache.js";

const template = fs.readFileSync(path.join(import.meta.dirname, "../src/sw/sw.js"), "utf8");
const retire = fs.readFileSync(path.join(import.meta.dirname, "../src/sw/retire.js"), "utf8");

/** A small built site in a temporary folder, with the real worker template. */
function site() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chock-sw-"));
  const files = {
    "src/sw/sw.js": template,
    "src/sw/retire.js": retire,
    "dist/index.html": "app",
    "dist/simbrief-probe.html": "probe",
    "dist/assets/simbrief-probe-1.js": "probe code",
    "dist/assets/simbrief-probe-1.css": "probe styles",
    "dist/og-image-1200x630.png": "preview picture",
    "dist/app/index.html": "moved",
    "dist/manifest.webmanifest": "{}",
    "dist/assets/app-1.js": "code",
    "dist/design/index.html": "design page",
    "dist/assets/design-1.js": "design code",
    "dist/packs/index.json": "[]",
    "dist/packs/demo-0.1.0.involo-pack": "{}",
  };
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  return root;
}

test("the worker precaches the app's files, relative to its own folder", () => {
  const root = site();
  const { files, version } = writeServiceWorker(root, "dist");
  // Sorted by path within the site, the worker's folder. The pack catalog is never precached:
  // packs are installed on the device (decision 0028). Nor is the old address's page (#246), the
  // SimBrief probe's page, script and styles, or the link preview's picture (#68).
  assert.deepEqual(files, ["assets/app-1.js", "index.html", "manifest.webmanifest"]);
  const worker = fs.readFileSync(path.join(root, "dist", WORKER), "utf8");
  assert.ok(worker.includes(`const VERSION = "${version}";`));
  assert.ok(worker.includes(`const FILES = ${JSON.stringify(files)};`));
  assert.ok(!worker.includes("__INVOLO_"));
  // The worker that retires the old address, where a copy installed from there looks (#246).
  assert.equal(fs.readFileSync(path.join(root, "dist", RETIRED_WORKER), "utf8"), retire);
  fs.rmSync(root, { recursive: true });
});

test("the version changes with any file and only then", () => {
  const root = site();
  const first = writeServiceWorker(root, "dist").version;
  assert.equal(
    writeServiceWorker(root, "dist").version,
    first,
    "rebuilding the same files keeps the version",
  );
  fs.writeFileSync(path.join(root, "dist/assets/app-1.js"), "changed code");
  assert.notEqual(writeServiceWorker(root, "dist").version, first);
  fs.rmSync(root, { recursive: true });
});
