// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Run `just test-packs` first (`just test` does).

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Writable } from "node:stream";
import { test } from "node:test";
import { serveTestCatalog } from "./test-catalog.js";

const serve = serveTestCatalog(path.join(import.meta.dirname, ".."));

/** What the middleware answers for a URL under packs/: the body and type it sent, or "next". */
function answer(url) {
  return new Promise((resolve) => {
    const chunks = [];
    const headers = {};
    const res = new Writable({
      write(chunk, _encoding, done) {
        chunks.push(chunk);
        done();
      },
    });
    res.setHeader = (name, value) => {
      headers[name] = value;
    };
    res.on("finish", () => resolve({ type: headers["Content-Type"], body: Buffer.concat(chunks) }));
    serve({ url }, res, () => resolve("next"));
  });
}

test("the dev server serves the test catalog at packs/, and nothing outside it", async () => {
  const dir = path.join(import.meta.dirname, "../../../target/test-packs");
  const index = await answer("/index.json");
  assert.equal(index.type, "application/json");
  assert.deepEqual(index.body, fs.readFileSync(path.join(dir, "index.json")));
  const [entry] = JSON.parse(index.body.toString("utf8"));
  const pack = await answer(`/${entry.id}-${entry.version}.involo-pack`);
  assert.equal(pack.type, "application/octet-stream");
  assert.equal(pack.body.byteLength, entry.size);
  assert.equal(await answer("/missing.involo-pack"), "next");
  assert.equal(await answer("/..%2F..%2Fjustfile"), "next");
});
