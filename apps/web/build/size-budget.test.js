// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { checkBudget, measure, size } from "./size-budget.js";

const script = path.join(import.meta.dirname, "size-budget.js");

/** A built site in a temporary folder: the app's files and a pack in the catalog. */
function site() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "involo-size-"));
  const files = {
    "index.html": "x".repeat(100),
    "assets/app-1.js": "x".repeat(300),
    "assets/web-host-1.js": "x".repeat(2000),
    "assets/host_bg-1.wasm": "x".repeat(5000),
    "packs/demo-0.1.0.involo-pack": "x".repeat(90000),
  };
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  return root;
}

/** Runs the budget step on `dist` with `budget`, as `just site` does: its exit code and output. */
function run(dist, budget) {
  const file = path.join(dist, "..", `${path.basename(dist)}-budget.json`);
  fs.writeFileSync(file, JSON.stringify(budget));
  try {
    return { code: 0, out: execFileSync("node", [script, dist, file], { encoding: "utf8", stdio: "pipe" }) };
  } catch (e) {
    return { code: e.status, out: `${e.stdout}${e.stderr}` };
  }
}

test("the app, the WebAssembly module and the largest script are measured, the catalog left out", () => {
  const m = measure(site());
  assert.equal(m.app.bytes, 7400);
  assert.deepEqual(m.wasm, { file: "assets/host_bg-1.wasm", bytes: 5000 });
  assert.deepEqual(m.script, { file: "assets/web-host-1.js", bytes: 2000 });
});

test("the step passes at the limits and fails when a limit is lowered below the size", () => {
  const dist = site();
  const atLimits = { app: 7400, wasm: 5000, script: 2000 };
  const passed = run(dist, atLimits);
  assert.equal(passed.code, 0, passed.out);
  assert.match(passed.out, /the WebAssembly module: 5 KB of 5 KB \(assets\/host_bg-1\.wasm\)/);
  for (const key of Object.keys(atLimits)) {
    const failed = run(dist, { ...atLimits, [key]: atLimits[key] - 1 });
    assert.equal(failed.code, 1, `${key}: ${failed.out}`);
    assert.match(failed.out, new RegExp(`is \\d+ KB \\(${atLimits[key]} bytes\\), over its limit`));
    assert.match(failed.out, /raise the limit in .* and say why in the pull request/);
  }
});

test("a missing or unknown limit is a problem, not a pass", () => {
  const m = measure(site());
  assert.deepEqual(checkBudget(m, { app: 7400, wasm: 5000 }).problems, [
    'the budget has no limit for the largest script ("script", in bytes)',
  ]);
  assert.deepEqual(checkBudget(m, { app: 7400, wasm: 5000, script: 2000, total: 1 }).problems, [
    'the budget\'s "total" limits nothing; the limits are app, wasm, script',
  ]);
});

test("the committed budget limits each size, and the built site is within it", () => {
  const budget = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "../size-budget.json"), "utf8"));
  assert.deepEqual(Object.keys(budget).sort(), ["app", "script", "wasm"]);
  const dist = path.join(import.meta.dirname, "../dist");
  if (fs.existsSync(path.join(dist, "sw.js")))
    assert.deepEqual(checkBudget(measure(dist), budget).problems, []);
});

test("sizes read as a person writes them", () => {
  assert.equal(size(2957043), "2.82 MB");
  assert.equal(size(532054), "520 KB");
});
