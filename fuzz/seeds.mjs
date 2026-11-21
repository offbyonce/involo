// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Writes the fuzz targets' seed corpus into target/fuzz-corpus/<target>/ from the packs in packs/
// and the test fixtures, so every run starts from real packs: the built pack files (`just
// test-packs`) for pack_file, each data file under the name pack.json gives it for data_file, and
// each pack folder with the packs it may extend for pack_folder. `just fuzz` runs it first. It
// also checks that the fuzz targets are built with the app's versions of the crates they share.

import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "target/fuzz-corpus");

// The fuzz targets have a lockfile of their own (fuzz/ is a workspace of its own); every crate it
// shares with the app must be the version the app is built with, or the fuzzing tests other code.
const versions = (file) => {
  const found = new Map();
  for (const m of fs.readFileSync(path.join(root, file), "utf8").matchAll(/\[\[package\]\]\nname = "([^"]+)"\nversion = "([^"]+)"/g))
    found.set(m[1], [...(found.get(m[1]) ?? []), m[2]]);
  return found;
};
const app = versions("Cargo.lock");
const differ = [...versions("fuzz/Cargo.lock")]
  .filter(([name, v]) => app.has(name) && v.some((x) => !app.get(name).includes(x)))
  .map(([name, v]) => `${name} ${v.join(", ")} (the app: ${app.get(name).join(", ")})`);
if (differ.length)
  throw new Error(
    `fuzz/Cargo.lock has other versions than Cargo.lock: ${differ.join("; ")}. Copy Cargo.lock over fuzz/Cargo.lock, then build the fuzz targets again (cargo keeps the app's versions and adds the fuzzing engine).`,
  );
const folders = [
  "packs/ifly-737-max8",
  "packs/examples/example-twin",
  "packs/examples/example-twin-lr",
  "packs/examples/example-sidestick",
].map((f) => path.join(root, f));

const write = (target, name, body) => {
  fs.mkdirSync(path.join(out, target), { recursive: true });
  fs.writeFileSync(path.join(out, target, name), body);
};

// The built pack files.
const built = path.join(root, "target/test-packs");
if (!fs.existsSync(path.join(built, "index.json"))) throw new Error("build the test packs first: just test-packs");
for (const f of fs.readdirSync(built).filter((f) => f.endsWith(".involo-pack")))
  write("pack_file", f, fs.readFileSync(path.join(built, f)));
// pack_edits takes edits, not files: it starts from nothing and builds them up.
fs.mkdirSync(path.join(out, "pack_edits"), { recursive: true });

/** Each data file pack.json lists, with the name it lists it under. */
function dataFiles(dir) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "pack.json"), "utf8"));
  const files = [["pack.json", "pack.json"]];
  for (const [kind, value] of Object.entries(manifest)) {
    for (const rel of [value].flat())
      if (typeof rel === "string" && /\.ya?ml$/.test(rel) && fs.existsSync(path.join(dir, rel))) files.push([kind, rel]);
  }
  return files;
}

for (const dir of folders) {
  const name = path.basename(dir);
  for (const [kind, rel] of dataFiles(dir))
    write("data_file", `${name}-${rel.replaceAll("/", "_")}`, `${kind}\n${fs.readFileSync(path.join(dir, rel), "utf8")}`);
}

/** A pack folder as pack_folder reads it. */
const asText = (dir) =>
  [`==== pack ${path.basename(dir)}\n`, ...dataFiles(dir).map(([, rel]) => `---- ${rel}\n${fs.readFileSync(path.join(dir, rel), "utf8")}`)].join("");
const [ifly, example, variant, sidestick] = folders;
write("pack_folder", "ifly-737-max8", asText(ifly));
write("pack_folder", "example-twin", asText(example));
write("pack_folder", "example-twin-lr", asText(variant) + asText(example));
write("pack_folder", "example-sidestick", asText(sidestick));
process.stdout.write(`wrote the seed corpus in ${path.relative(root, out)}\n`);
