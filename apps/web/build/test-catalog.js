// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The dev server's packs: the test catalog that `just test-packs` builds into target/test-packs
// (the published packs and the example), served at packs/ as the site serves the published one.

import fs from "node:fs";
import path from "node:path";

/** A middleware for packs/ that serves the files in the test catalog, and passes anything else on. */
export function serveTestCatalog(root) {
  const dir = path.resolve(root, "../../target/test-packs");
  return (req, res, next) => {
    const name = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "").replace(/^\//, "");
    const file = path.join(dir, name);
    if (!/^[\w.-]+$/.test(name) || !fs.existsSync(file)) return next();
    res.setHeader("Content-Type", name.endsWith(".json") ? "application/json" : "application/octet-stream");
    fs.createReadStream(file).pipe(res);
  };
}
