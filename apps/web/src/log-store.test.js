// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import { test } from "node:test";
import { DB_VERSION, PACK_STORE } from "./app-db.js";
import { fakeIndexedDB, refusingIndexedDB } from "./fake-indexeddb.js";
import { DB_NAME, KEY, readLog, STORE, writeLog } from "./log-store.js";

test("a saved log reads back, under the app's own database and key", async () => {
  const idb = fakeIndexedDB();
  assert.equal(await readLog(idb), null, "nothing saved yet");
  assert.equal(await writeLog('{"format":1}', idb), true);
  assert.equal(await readLog(idb), '{"format":1}');
  assert.equal(idb.store(DB_NAME, STORE).get(KEY), '{"format":1}');
  // A later save replaces it.
  await writeLog('{"format":1,"flights":[]}', idb);
  assert.equal(await readLog(idb), '{"format":1,"flights":[]}');
  assert.deepEqual(idb.opened[0], [DB_NAME, DB_VERSION]);
});

test("a database that refuses a save says so, and the saved log stays as it was", async () => {
  const idb = fakeIndexedDB();
  await writeLog("first", idb);
  const full = fakeIndexedDB({ failWrites: true });
  full.dbs.set(DB_NAME, idb.dbs.get(DB_NAME));
  assert.equal(await writeLog("second", full), false);
  assert.equal(await readLog(idb), "first");
});

test("with no IndexedDB (a blocked private window) there is no log and nothing is saved", async () => {
  assert.equal(await readLog(undefined), null);
  assert.equal(await writeLog("x", undefined), false);
  assert.equal(await writeLog("x", refusingIndexedDB), false);
});

test("a database that fails to read is an error, never an empty log, which a later save would write over the real one", async () => {
  await assert.rejects(readLog(refusingIndexedDB));
  const idb = fakeIndexedDB();
  await writeLog("x", idb);
  idb.store(DB_NAME, STORE).set(KEY, { not: "text" });
  await assert.rejects(readLog(idb));
});

test("a log saved before packs were kept beside it reads back after the database upgrades", async () => {
  const idb = fakeIndexedDB();
  // The database as version 1 left it: the log's store and nothing else.
  idb.dbs.set(DB_NAME, { version: 1, stores: new Map([[STORE, new Map([[KEY, "kept"]])]]) });
  assert.equal(await readLog(idb), "kept");
  assert.equal(idb.dbs.get(DB_NAME).version, DB_VERSION);
  assert.ok(idb.store(DB_NAME, PACK_STORE), "the packs' store is added");
  assert.equal(await writeLog("next", idb), true);
  assert.equal(await readLog(idb), "next");
});
