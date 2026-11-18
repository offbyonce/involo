// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeIndexedDB, refusingIndexedDB } from "./fake-indexeddb.js";
import { DB_NAME, deletePack, readPacks, readPackText, STORE, writePack } from "./pack-store.js";

const summary = (id, version) => ({ id, name: id, version, kind: "aircraft" });
const record = (id, version, source = "catalog") => ({
  summary: summary(id, version),
  source,
  installedAt: 7,
  text: `{"pack":"${id} ${version}"}`,
});

test("an installed pack reads back after a reload, without its text in the list", async () => {
  const idb = fakeIndexedDB();
  assert.deepEqual(await readPacks(idb), []);
  assert.equal(await writePack(record("b-jet", "1.0.0"), idb), true);
  assert.equal(await writePack(record("a-jet", "0.1.0", "file"), idb), true);
  // A reload opens the database again: the packs are there.
  assert.deepEqual(await readPacks(idb), [
    { summary: summary("a-jet", "0.1.0"), source: "file", installedAt: 7 },
    { summary: summary("b-jet", "1.0.0"), source: "catalog", installedAt: 7 },
  ]);
  assert.equal(await readPackText("b-jet", idb), '{"pack":"b-jet 1.0.0"}');
  assert.equal(await readPackText("c-jet", idb), null);
});

test("installing a second version of a pack replaces the first", async () => {
  const idb = fakeIndexedDB();
  await writePack(record("a-jet", "0.1.0"), idb);
  await writePack(record("a-jet", "0.2.0", "file"), idb);
  const packs = await readPacks(idb);
  assert.equal(packs.length, 1);
  assert.equal(packs[0].summary.version, "0.2.0");
  assert.equal(packs[0].source, "file");
  assert.equal(idb.store(DB_NAME, STORE).size, 1);
  assert.equal(await readPackText("a-jet", idb), '{"pack":"a-jet 0.2.0"}');
});

test("a removed pack is gone, and the others stay", async () => {
  const idb = fakeIndexedDB();
  await writePack(record("a-jet", "0.1.0"), idb);
  await writePack(record("b-jet", "0.1.0"), idb);
  assert.equal(await deletePack("a-jet", idb), true);
  assert.deepEqual(
    (await readPacks(idb)).map((p) => p.summary.id),
    ["b-jet"],
  );
});

test("with no IndexedDB nothing is installed and nothing is kept", async () => {
  assert.deepEqual(await readPacks(undefined), []);
  assert.equal(await readPackText("a-jet", undefined), null);
  assert.equal(await writePack(record("a-jet", "0.1.0"), undefined), false);
  assert.equal(await writePack(record("a-jet", "0.1.0"), refusingIndexedDB), false);
  assert.equal(await deletePack("a-jet", refusingIndexedDB), false);
});

test("a database that refuses a save says so, and the installed version stays", async () => {
  const idb = fakeIndexedDB();
  await writePack(record("a-jet", "0.1.0"), idb);
  const full = fakeIndexedDB({ failWrites: true });
  full.dbs.set(DB_NAME, idb.dbs.get(DB_NAME));
  assert.equal(await writePack(record("a-jet", "0.2.0"), full), false);
  assert.equal(await readPackText("a-jet", idb), '{"pack":"a-jet 0.1.0"}');
});

test("a database that fails to read is an error, and a record this version can't use is left out", async () => {
  await assert.rejects(readPacks(refusingIndexedDB));
  await assert.rejects(readPackText("a-jet", refusingIndexedDB));
  const idb = fakeIndexedDB();
  await writePack(record("a-jet", "0.1.0"), idb);
  idb.store(DB_NAME, STORE).set("odd", { not: "a pack" });
  assert.deepEqual(
    (await readPacks(idb)).map((p) => p.summary.id),
    ["a-jet"],
  );
  assert.equal(await readPackText("odd", idb), null);
});
