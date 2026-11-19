// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Installs the built iFly pack through the real WebAssembly check into a fake IndexedDB. Run
// `just wasm test-packs` first (`just test` does).

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { testPackText } from "../test-packs.js";
import { fakeIndexedDB } from "./fake-indexeddb.js";
import { catalogFile, downloadPack, installFile, installFromCatalog, readCatalog } from "./pack-install.js";
import { readPacks, readPackText, writePack } from "./pack-store.js";
import * as wasm from "./wasm/involo_web_host.js";

const here = import.meta.dirname;
wasm.initSync({ module: fs.readFileSync(path.join(here, "wasm/involo_web_host_bg.wasm")) });

const text = testPackText("ifly-737-max8");
const bytes = new TextEncoder().encode(text);
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const limit = wasm.pack_file_limit();
const entry = {
  id: "ifly-737-max8",
  name: "iFly 737 MAX 8",
  version: "0.1.0",
  aircraft: JSON.parse(text).manifest.aircraft,
  engine: ">=0.1.0",
  size: bytes.length,
  sha256: sha256(bytes),
};

/** Install calls on a fresh device: the real check, a fake database (null: none), and a count of
 * the times the browser is asked to keep the site's data. */
function device(idb = fakeIndexedDB()) {
  const asked = { count: 0 };
  return {
    idb,
    asked,
    deps: {
      limit,
      check: async (b, sha) => JSON.parse(wasm.check_pack(b, sha)).ok,
      keep: (record) => writePack(record, idb),
      now: () => 42,
      askToKeep: () => asked.count++,
    },
  };
}

const file = (b) => new Blob([b]);
const served =
  (b, headers = {}) =>
  async () =>
    new Response(b, { status: 200, headers });

test("a pack file the pilot chose is checked, kept, and there after a reload", async () => {
  const d = device();
  const result = await installFile(file(bytes), d.deps);
  assert.equal(result.state, "installed");
  assert.equal(result.pack.summary.id, "ifly-737-max8");
  assert.equal(result.pack.source, "file");
  assert.equal(d.asked.count, 1, "the browser is asked to keep the site's data");
  assert.deepEqual(await readPacks(d.idb), [result.pack]);
  assert.equal(await readPackText("ifly-737-max8", d.idb), text);
});

test("a catalog download is kept only when its SHA-256 matches the catalog", async () => {
  const d = device();
  const fetched = [];
  const fetch = async (url, init) => {
    fetched.push([url, init]);
    return new Response(bytes);
  };
  const result = await installFromCatalog(entry, { ...d.deps, fetch });
  assert.equal(result.state, "installed");
  assert.equal(result.pack.source, "catalog");
  assert.deepEqual(fetched, [
    ["../packs/ifly-737-max8-0.1.0.involo-pack", { credentials: "omit", referrerPolicy: "no-referrer" }],
  ]);
  // Tampered on the way: a valid pack, one letter changed, so the hash differs.
  const t = device();
  const tampered = new TextEncoder().encode(text.replace("iFly 737 MAX 8", "iFly 737 MAX 9"));
  const refused = await installFromCatalog(entry, { ...t.deps, fetch: served(tampered) });
  assert.equal(refused.state, "refused");
  assert.match(refused.reasons[0], /SHA-256 differs/);
  assert.deepEqual(await readPacks(t.idb), [], "nothing is stored");
  assert.equal(t.asked.count, 0);
});

test("a file over the limit is refused before it is read, and a download before it is fetched", async () => {
  const d = device();
  const huge = { size: limit + 1, arrayBuffer: () => assert.fail("the file was read") };
  assert.deepEqual(await installFile(huge, d.deps), {
    state: "refused",
    reasons: ["That file is too large to be an Involo pack (over 16 MB), so it wasn’t read."],
  });
  const never = () => assert.fail("the pack was fetched");
  const big = await installFromCatalog({ ...entry, size: limit + 1 }, { ...d.deps, fetch: never });
  assert.equal(big.state, "refused");
  // The catalog may be wrong: the server's length is checked before the body is read.
  const response = new Response(bytes, { headers: { "content-length": String(limit + 1) } });
  response.arrayBuffer = () => assert.fail("the download was read");
  const served = await installFromCatalog(entry, { ...d.deps, fetch: async () => response });
  assert.equal(served.state, "refused");
  assert.deepEqual(await readPacks(d.idb), []);
});

test("a pack that fails its checks is refused with the reasons, and nothing is stored", async () => {
  const d = device();
  const broken = text.replace('"icaoTypes":["B38M"]', '"icaoTypes":["b38m"]');
  assert.notEqual(broken, text);
  const result = await installFile(file(new TextEncoder().encode(broken)), d.deps);
  assert.equal(result.state, "refused");
  assert.match(result.reasons[0], /^pack\.json: `b38m` is not an ICAO type designator/);
  const library = text.replace('"kind":"aircraft"', '"kind":"library"');
  assert.equal((await installFile(file(new TextEncoder().encode(library)), d.deps)).state, "refused");
  const notAPack = await installFile(file(new TextEncoder().encode("hello")), d.deps);
  assert.deepEqual(notAPack.reasons, ["This is not an Involo pack file."]);
  assert.deepEqual(await readPacks(d.idb), []);
});

test("installing a second version replaces the first", async () => {
  const d = device();
  await installFile(file(bytes), d.deps);
  const next = text.replace('"version":"0.1.0"', '"version":"0.2.0"');
  assert.notEqual(next, text);
  const result = await installFile(file(new TextEncoder().encode(next)), d.deps);
  assert.equal(result.state, "installed");
  const packs = await readPacks(d.idb);
  assert.deepEqual(
    packs.map((p) => p.summary.version),
    ["0.2.0"],
  );
  assert.equal(await readPackText("ifly-737-max8", d.idb), next);
});

test("with no IndexedDB a pack that passes is reported as not kept", async () => {
  const d = device(null);
  const result = await installFile(file(bytes), d.deps);
  assert.equal(result.state, "notKept");
  assert.equal(result.pack.summary.id, "ifly-737-max8");
  assert.equal(d.asked.count, 0);
});

test("the catalog is read from the app's own site with nothing about the pilot", async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push([url, init]);
    return new Response(JSON.stringify([entry]));
  };
  const parse = async (t) => JSON.parse(wasm.parse_catalog(t)).ok;
  assert.deepEqual(await readCatalog({ fetch, parse }), [entry]);
  assert.deepEqual(calls, [
    ["../packs/index.json", { credentials: "omit", referrerPolicy: "no-referrer", cache: "no-cache" }],
  ]);
  assert.equal(catalogFile(entry), "ifly-737-max8-0.1.0.involo-pack");
});

test("an update is downloaded and checked for What's new without installing it", async () => {
  const d = device();
  const got = await downloadPack(entry, { ...d.deps, fetch: served(bytes) });
  assert.equal(got.state, "ready");
  assert.equal(got.bytes.length, bytes.length);
  assert.deepEqual(await readPacks(d.idb), [], "nothing is installed");
  const tampered = new TextEncoder().encode(text.replace("iFly 737 MAX 8", "iFly 737 MAX 9"));
  const refused = await downloadPack(entry, { ...d.deps, fetch: served(tampered) });
  assert.equal(refused.state, "refused");
  assert.match(refused.reasons[0], /SHA-256 differs/);
});
