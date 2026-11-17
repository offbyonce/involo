// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The third-party licenses file (References › Open-source software), made at build time from what
// the app actually ships: the Rust crates linked into the WebAssembly module (cargo metadata, normal
// dependencies of involo-web-host for the wasm target, without proc-macros, which run only at build time),
// the JavaScript packages in the bundle (the modules Rollup includes), and the bundled fonts and
// icons. Each with its version, its license and the license texts its package ships.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** A package's license and notice files (LICENSE, LICENSE-MIT, COPYING, NOTICE...), sorted. */
export function licenseFiles(dir) {
  let names = [];
  try {
    names = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && /^(licen[cs]e|copying|notice)/i.test(e.name));
  } catch {
    return [];
  }
  return names
    .map((e) => e.name)
    .sort()
    .map((name) => ({ name, text: fs.readFileSync(path.join(dir, name), "utf8").trim() }));
}

/**
 * The crates linked into `root` for the wasm target, from `cargo metadata` output: its normal
 * dependencies, transitively, leaving out proc-macro crates (and what only they use) and the
 * workspace's own crates.
 */
export function rustCrates(metadata, root = "involo-web-host") {
  const packages = new Map(metadata.packages.map((p) => [p.id, p]));
  const nodes = new Map(metadata.resolve.nodes.map((n) => [n.id, n]));
  const start = metadata.packages.find((p) => p.name === root && p.source === null);
  if (!start) throw new Error(`no workspace crate named ${root}`);
  const macro = (p) => p.targets.some((t) => t.kind.includes("proc-macro"));
  const seen = new Set();
  const todo = [start.id];
  while (todo.length) {
    const id = todo.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    for (const dep of nodes.get(id)?.deps ?? []) {
      const p = packages.get(dep.pkg);
      if (p && !macro(p) && dep.dep_kinds.some((k) => k.kind === null)) todo.push(dep.pkg);
    }
  }
  return [...seen]
    .map((id) => packages.get(id))
    .filter((p) => p && p.source !== null)
    .map((p) => ({
      name: p.name,
      version: p.version,
      license: p.license ?? "",
      dir: path.dirname(p.manifest_path),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

/** The packages behind bundled module ids (paths under node_modules), each once. */
export function jsPackages(ids) {
  const dirs = new Set();
  for (const id of ids) {
    const at = id.replaceAll("\\", "/").lastIndexOf("/node_modules/");
    if (at < 0) continue;
    const rest = id
      .replaceAll("\\", "/")
      .slice(at + "/node_modules/".length)
      .split("/");
    const name = rest[0]?.startsWith("@") ? rest.slice(0, 2).join("/") : rest[0];
    if (name) dirs.add(id.replaceAll("\\", "/").slice(0, at + "/node_modules/".length) + name);
  }
  return [...dirs]
    .map((dir) => {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
      return {
        name: pkg.name,
        version: pkg.version,
        license: typeof pkg.license === "string" ? pkg.license : "",
        dir,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The file's text: a heading, then each entry with its license texts. A package that ships no
 * license file gets the standard text of a license its expression names, from `standard` (by SPDX
 * id), so the notice its license asks for is still there.
 */
export function licensesText(groups, standard = {}) {
  const out = [
    "Involo: third-party software",
    "",
    "Involo is open source (MIT). It includes the software and assets below, each under its own license.",
    "",
  ];
  for (const g of groups) {
    out.push("=".repeat(72), g.title, "=".repeat(72), "");
    for (const e of g.entries) {
      out.push(`${e.name} ${e.version}`.trim(), `License: ${e.license || "see below"}`, "");
      const texts = e.texts ?? licenseFiles(e.dir);
      const fallback = Object.keys(standard).find((id) =>
        new RegExp(`(^|[^A-Za-z0-9.-])${id}($|[^A-Za-z0-9.-])`).test(e.license),
      );
      if (!texts.length && fallback)
        out.push(
          `(The package ships no license file; the standard ${fallback} text follows.)`,
          `--- ${fallback} ---`,
          standard[fallback],
          "",
        );
      else if (!texts.length)
        out.push("(The package ships no license file; it is licensed as stated above.)", "");
      for (const t of texts) out.push(`--- ${t.name} ---`, t.text, "");
    }
  }
  return `${out.join("\n").trimEnd()}\n`;
}

/** Reads `cargo metadata` for the workspace at `root` (the repository). */
export function cargoMetadata(root) {
  const json = execFileSync(
    "cargo",
    ["metadata", "--format-version", "1", "--locked", "--filter-platform", "wasm32-unknown-unknown"],
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  return JSON.parse(json);
}

/**
 * The whole file for the web app built at `webRoot` (apps/web) from the bundled module `ids`: the
 * crates in the WebAssembly module and the Rust standard library, the JavaScript packages, and the
 * bundled fonts and icons.
 */
export function thirdPartyText(webRoot, ids) {
  const repo = path.resolve(webRoot, "../..");
  const read = (file) => fs.readFileSync(path.join(repo, file), "utf8").trim();
  // The MIT text without its template's "<year> <copyright holders>" line; each entry gives its own.
  const mit = read("LICENSES/MIT.txt").replace(/^Copyright \(c\) <year> <copyright holders>\n+/m, "");
  // The Rust standard library is linked into the module too (MIT OR Apache-2.0; MIT chosen).
  const std = {
    name: "Rust standard library (core, alloc, std)",
    version: "",
    license: "MIT OR Apache-2.0",
    texts: [
      { name: "Copyright", text: "Copyright (c) The Rust Project Contributors" },
      { name: "MIT", text: mit },
    ],
  };
  const assets = [
    {
      name: "Geist and Geist Mono fonts",
      version: "",
      license: "OFL-1.1",
      texts: [{ name: "GEIST-OFL.txt", text: read("assets/brand/GEIST-OFL.txt") }],
    },
    {
      name: "Tabler icons (the ones the interface uses)",
      version: "",
      license: "MIT",
      // The upstream notice MIT requires us to keep (REUSE.toml).
      texts: [
        { name: "Copyright", text: "Copyright (c) 2020-2026 Paweł Kuna" },
        { name: "MIT", text: mit },
      ],
    },
  ];
  return licensesText(
    [
      { title: "Rust crates in the WebAssembly module", entries: [...rustCrates(cargoMetadata(repo)), std] },
      { title: "JavaScript packages", entries: jsPackages(ids) },
      { title: "Fonts and icons", entries: assets },
    ],
    { MIT: mit },
  );
}
