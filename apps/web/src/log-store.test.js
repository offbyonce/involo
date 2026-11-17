// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import { test } from "node:test";
import { DB_NAME, KEY, readLog, STORE, writeLog } from "./log-store.js";

/** A request that succeeds or fails on the next turn, as IndexedDB's do. */
function request(work) {
  const r = { result: undefined, error: null };
  queueMicrotask(() => {
    try {
      r.result = work();
      r.onsuccess?.();
    } catch (e) {
      r.error = e;
      r.onerror?.();
    }
  });
  return r;
}

/** Just enough IndexedDB for the log: databases of stores of keyed values, kept between opens. */
function fakeIndexedDB({ failWrites = false } = {}) {
  const dbs = new Map();
  const opened = [];
  return {
    opened,
    dbs,
    open(name, version) {
      const r = { result: undefined, error: null };
      queueMicrotask(() => {
        const fresh = !dbs.has(name);
        if (fresh) dbs.set(name, new Map());
        const stores = dbs.get(name);
        const db = {
          objectStoreNames: { contains: (s) => stores.has(s) },
          createObjectStore: (s) => stores.set(s, new Map()),
          close() {},
          transaction(store, mode) {
            const tx = {};
            const finish = (req) => {
              const done = () => queueMicrotask(() => (req.error ? tx.onerror?.() : tx.oncomplete?.()));
              const ok = req.onsuccess;
              req.onsuccess = () => {
                ok?.();
                done();
              };
              req.onerror = () => {
                tx.error = req.error;
                done();
              };
              return req;
            };
            tx.objectStore = () => ({
              get: (k) => finish(request(() => stores.get(store).get(k))),
              put: (v, k) =>
                finish(
                  request(() => {
                    if (mode !== "readwrite") throw new Error("read-only");
                    if (failWrites) throw new Error("quota");
                    stores.get(store).set(k, v);
                    return k;
                  }),
                ),
            });
            return tx;
          },
        };
        opened.push([name, version]);
        r.result = db;
        if (fresh) r.onupgradeneeded?.();
        r.onsuccess?.();
      });
      return r;
    },
  };
}

test("a saved log reads back, under the app's own database and key", async () => {
  const idb = fakeIndexedDB();
  assert.equal(await readLog(idb), null, "nothing saved yet");
  assert.equal(await writeLog('{"format":1}', idb), true);
  assert.equal(await readLog(idb), '{"format":1}');
  assert.equal(idb.dbs.get(DB_NAME).get(STORE).get(KEY), '{"format":1}');
  // A later save replaces it.
  await writeLog('{"format":1,"flights":[]}', idb);
  assert.equal(await readLog(idb), '{"format":1,"flights":[]}');
  assert.deepEqual(idb.opened[0], [DB_NAME, 1]);
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
  const broken = {
    open() {
      const r = {};
      queueMicrotask(() => {
        r.error = new Error("denied");
        r.onerror?.();
      });
      return r;
    },
  };
  assert.equal(await writeLog("x", broken), false);
});

test("a database that fails to read is an error, never an empty log, which a later save would write over the real one", async () => {
  const broken = {
    open() {
      const r = {};
      queueMicrotask(() => {
        r.error = new Error("denied");
        r.onerror?.();
      });
      return r;
    },
  };
  await assert.rejects(readLog(broken));
  const idb = fakeIndexedDB();
  await writeLog("x", idb);
  idb.dbs.get(DB_NAME).get(STORE).set(KEY, { not: "text" });
  await assert.rejects(readLog(idb));
});
