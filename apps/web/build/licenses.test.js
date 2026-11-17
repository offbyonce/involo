// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { jsPackages, licenseFiles, licensesText, rustCrates } from "./licenses.js";

const pkg = (name, source, kinds = ["lib"]) => ({
  id: `${name} 1.0.0`,
  name,
  version: "1.0.0",
  source,
  license: "MIT",
  manifest_path: `/reg/${name}/Cargo.toml`,
  targets: [{ kind: kinds }],
});
const dep = (name, kind = null) => ({ pkg: `${name} 1.0.0`, dep_kinds: [{ kind }] });

test("lists the crates linked into the WebAssembly module, without build-only crates", () => {
  const metadata = {
    packages: [
      pkg("involo-web-host", null),
      pkg("involo-app-core", null),
      pkg("serde", "registry"),
      pkg("serde_derive", "registry", ["proc-macro"]),
      pkg("syn", "registry"),
      pkg("insta", "registry"),
      pkg("cc", "registry"),
    ],
    resolve: {
      nodes: [
        { id: "involo-web-host 1.0.0", deps: [dep("involo-app-core"), dep("serde"), dep("insta", "dev")] },
        { id: "involo-app-core 1.0.0", deps: [dep("serde"), dep("cc", "build")] },
        { id: "serde 1.0.0", deps: [dep("serde_derive")] },
        { id: "serde_derive 1.0.0", deps: [dep("syn")] },
      ],
    },
  };
  // Our own crates are not third-party; dev and build dependencies and proc-macros (and syn,
  // which only the macro uses) never reach the module.
  assert.deepEqual(
    rustCrates(metadata).map((c) => c.name),
    ["serde"],
  );
});

test("names each bundled JavaScript package once, scoped names whole", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "licenses-"));
  const nm = path.join(root, "node_modules", ".pnpm", "x", "node_modules");
  for (const [name, license] of [
    ["svelte", "MIT"],
    ["@scope/thing", "ISC"],
  ]) {
    fs.mkdirSync(path.join(nm, name), { recursive: true });
    fs.writeFileSync(
      path.join(nm, name, "package.json"),
      JSON.stringify({ name, version: "2.0.0", license }),
    );
  }
  fs.writeFileSync(path.join(nm, "svelte", "LICENSE.md"), "MIT License\n\nCopyright (c) the authors\n");
  const ids = [
    path.join(nm, "svelte", "src", "a.js"),
    path.join(nm, "svelte", "src", "b.js"),
    path.join(nm, "@scope", "thing", "index.js"),
    "/repo/packages/ui/src/App.svelte",
  ];
  const found = jsPackages(ids);
  assert.deepEqual(
    found.map((p) => [p.name, p.version, p.license]),
    [
      ["@scope/thing", "2.0.0", "ISC"],
      ["svelte", "2.0.0", "MIT"],
    ],
  );
  assert.deepEqual(
    licenseFiles(found[1]?.dir ?? "").map((f) => f.name),
    ["LICENSE.md"],
  );
  const text = licensesText([{ title: "JavaScript packages", entries: found }]);
  assert.match(text, /svelte 2\.0\.0\nLicense: MIT\n\n--- LICENSE\.md ---\nMIT License/);
  // A package without a license file says so rather than leaving a gap.
  assert.match(text, /@scope\/thing 2\.0\.0\nLicense: ISC\n\n\(The package ships no license file/);
});

test("gives a package without a license file the standard text its license names", () => {
  const text = licensesText(
    [
      {
        title: "Rust crates",
        entries: [
          { name: "ts-rs", version: "12.0.1", license: "MIT", dir: "/nowhere" },
          { name: "odd", version: "1.0.0", license: "Zlib", dir: "/nowhere" },
        ],
      },
    ],
    { MIT: "MIT License text" },
  );
  assert.match(
    text,
    /ts-rs 12\.0\.1\nLicense: MIT\n\n\(The package ships no license file; the standard MIT text follows\.\)\n--- MIT ---\nMIT License text/,
  );
  assert.match(
    text,
    /odd 1\.0\.0\nLicense: Zlib\n\n\(The package ships no license file; it is licensed as stated above\.\)/,
  );
});
