// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Checks the built site's pack catalog (decision 0028), the last step of `just site`: packs/ holds
// index.json and exactly the pack files it lists, each of the size and SHA-256 it gives, and no
// pack is in the app's own files or the service worker's precache list. A pack is found anywhere
// by its content hash, which only its own file carries.
// Run as `node apps/web/build/site-check.js <dist>`.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function filesIn(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesIn(full, base) : [path.relative(base, full).split(path.sep).join("/")];
  });
}

/** What is wrong with the built site's catalog, or nothing. */
export function catalogProblems(dist) {
  const problems = [];
  const packs = path.join(dist, "packs");
  const indexFile = path.join(packs, "index.json");
  if (!fs.existsSync(indexFile)) return ["packs/index.json is missing"];
  const index = JSON.parse(fs.readFileSync(indexFile, "utf8"));
  if (index.length === 0) problems.push("the catalog lists no packs");
  const listed = new Set(["index.json"]);
  const hashes = [];
  for (const entry of index) {
    const file = `${entry.id}-${entry.version}.involo-pack`;
    listed.add(file);
    const full = path.join(packs, file);
    if (!fs.existsSync(full)) {
      problems.push(`packs/${file} is missing`);
      continue;
    }
    const bytes = fs.readFileSync(full);
    if (bytes.length !== entry.size)
      problems.push(`packs/${file} is ${bytes.length} bytes, not ${entry.size}`);
    if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256)
      problems.push(`packs/${file} does not match its SHA-256`);
    if (!entry.aircraft || !entry.engine)
      problems.push(`packs/${file}: its entry lacks the aircraft or engine`);
    const hash = JSON.parse(bytes.toString("utf8")).manifest?.contentHash;
    if (hash) hashes.push([file, hash]);
  }
  for (const file of fs.readdirSync(packs))
    if (!listed.has(file)) problems.push(`packs/${file} is not in the catalog`);
  for (const file of filesIn(dist).filter((f) => !f.startsWith("packs/"))) {
    const text = fs.readFileSync(path.join(dist, file), "latin1");
    if (file === "sw.js" && /["'](?:\.\.\/)?packs\//.test(text))
      problems.push("the service worker precaches the pack catalog");
    for (const [pack, hash] of hashes) if (text.includes(hash)) problems.push(`${file} holds ${pack}`);
  }
  return problems;
}

if (process.argv[1] === import.meta.filename) {
  const dist = process.argv[2] ?? "apps/web/dist";
  const problems = catalogProblems(dist);
  if (problems.length > 0) {
    console.error(`site: the pack catalog is not right:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  console.log("site: the catalog is under packs/, and no pack is in the app or its precache list");
}
