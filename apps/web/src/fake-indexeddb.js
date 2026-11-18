// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Just enough IndexedDB for the app's stores, for Node's test runner: databases of stores of keyed
// values, kept between opens, with versions. Opening at a later version upgrades; at an earlier
// one fails, as a browser's does.

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

export function fakeIndexedDB({ failWrites = false } = {}) {
  /** name → { version, stores: Map(store → Map(key → value)) } */
  const dbs = new Map();
  const opened = [];
  return {
    opened,
    dbs,
    /** The values in a store, or undefined. */
    store: (name, store) => dbs.get(name)?.stores.get(store),
    open(name, version) {
      const r = { result: undefined, error: null };
      queueMicrotask(() => {
        if (!dbs.has(name)) dbs.set(name, { version: 0, stores: new Map() });
        const entry = dbs.get(name);
        if (version < entry.version) {
          r.error = new Error(`VersionError: ${name} is at version ${entry.version}`);
          r.onerror?.();
          return;
        }
        const stores = entry.stores;
        const db = {
          objectStoreNames: { contains: (s) => stores.has(s) },
          createObjectStore: (s) => stores.set(s, new Map()),
          close() {},
          transaction(store, mode) {
            if (!stores.has(store)) throw new Error(`NotFoundError: no store ${store}`);
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
            const write = (work) =>
              finish(
                request(() => {
                  if (mode !== "readwrite") throw new Error("read-only");
                  if (failWrites) throw new Error("quota");
                  return work();
                }),
              );
            tx.objectStore = () => ({
              get: (k) => finish(request(() => stores.get(store).get(k))),
              getAll: () => finish(request(() => [...stores.get(store).values()])),
              put: (v, k) =>
                write(() => {
                  stores.get(store).set(k, v);
                  return k;
                }),
              delete: (k) =>
                write(() => {
                  stores.get(store).delete(k);
                }),
            });
            return tx;
          },
        };
        opened.push([name, version]);
        r.result = db;
        if (version > entry.version) {
          entry.version = version;
          r.onupgradeneeded?.();
        }
        r.onsuccess?.();
      });
      return r;
    },
  };
}

/** An IndexedDB that fails every open, as a blocked one does. */
export const refusingIndexedDB = {
  open() {
    const r = {};
    queueMicrotask(() => {
      r.error = new Error("denied");
      r.onerror?.();
    });
    return r;
  },
};
