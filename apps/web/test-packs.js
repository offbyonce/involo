// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The test catalog (`just test-packs` builds it into target/test-packs, as `just catalog` builds
// the published one), for Node's tests.

import fs from "node:fs";
import path from "node:path";

const DIR = path.join(import.meta.dirname, "../../target/test-packs");

/** A pack's file text from the test catalog, found by id through its index.json. */
export function testPackText(id) {
  const index = JSON.parse(fs.readFileSync(path.join(DIR, "index.json"), "utf8"));
  const entry = index.find((e) => e.id === id);
  if (!entry) throw new Error(`${id} is not in the test catalog; run just test-packs`);
  return fs.readFileSync(path.join(DIR, `${entry.id}-${entry.version}.involo-pack`), "utf8");
}
