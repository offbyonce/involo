// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The built site's size budget (apps/web/size-budget.json), the last step of `just site`: the app
// (every file except the pack catalog, which is fetched one pack at a time and bounded by the pack
// limits in docs/packs/limits.md), the WebAssembly module and the largest script, each in bytes.
// A pull request that raises a limit says why.
// Run as `node apps/web/build/size-budget.js <dist> <budget>`.

import fs from "node:fs";
import path from "node:path";

function filesIn(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesIn(full, base) : [path.relative(base, full).split(path.sep).join("/")];
  });
}

/** What the budget limits, as measured in the built site `dist`: each with its size and the file. */
export function measure(dist) {
  const files = filesIn(dist)
    .filter((f) => !f.startsWith("packs/"))
    .map((file) => ({ file, bytes: fs.statSync(path.join(dist, file)).size }));
  const largest = (re) =>
    files
      .filter((f) => re.test(f.file))
      .reduce((a, b) => (b.bytes > a.bytes ? b : a), { file: "none", bytes: 0 });
  return {
    app: { bytes: files.reduce((sum, f) => sum + f.bytes, 0), file: "every file but packs/" },
    wasm: largest(/\.wasm$/),
    script: largest(/\.m?js$/),
  };
}

const NAMES = { app: "the app", wasm: "the WebAssembly module", script: "the largest script" };

/** `bytes` as a person reads it: 2.82 MB, 520 KB. */
export function size(bytes) {
  const mb = 1024 * 1024;
  return bytes >= mb ? `${(bytes / mb).toFixed(2)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

/** Each limit with its size, and the problems: a limit gone over, missing or not a size. */
export function checkBudget(measured, budget) {
  const rows = [];
  const problems = [];
  for (const [key, name] of Object.entries(NAMES)) {
    const limit = budget[key];
    const { bytes, file } = measured[key];
    if (!Number.isInteger(limit) || limit <= 0) {
      problems.push(`the budget has no limit for ${name} ("${key}", in bytes)`);
      continue;
    }
    rows.push(`${name}: ${size(bytes)} of ${size(limit)} (${file})`);
    if (bytes > limit)
      problems.push(
        `${name} is ${size(bytes)} (${bytes} bytes), over its limit of ${size(limit)} (${limit} bytes)`,
      );
  }
  for (const key of Object.keys(budget))
    if (!(key in NAMES))
      problems.push(`the budget's "${key}" limits nothing; the limits are ${Object.keys(NAMES).join(", ")}`);
  return { rows, problems };
}

if (process.argv[1] === import.meta.filename) {
  const dist = process.argv[2] ?? "apps/web/dist";
  const budgetFile = process.argv[3] ?? "apps/web/size-budget.json";
  const { rows, problems } = checkBudget(measure(dist), JSON.parse(fs.readFileSync(budgetFile, "utf8")));
  console.log(`site: sizes against the budget in ${budgetFile}:\n  ${rows.join("\n  ")}`);
  if (problems.length > 0) {
    console.error(
      `site: over the size budget:\n  ${problems.join("\n  ")}\n` +
        `Make it smaller, or raise the limit in ${budgetFile} and say why in the pull request.`,
    );
    process.exit(1);
  }
}
