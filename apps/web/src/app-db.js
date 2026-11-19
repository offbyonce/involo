// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The app's IndexedDB database on this device, shared by the flight log (decision 0026) and the
// installed packs (decision 0028). Every store is opened here, at one version, so a store added
// later upgrades the database instead of leaving older code unable to open it.
// Plain JavaScript, so Node's test runner covers it with a fake IndexedDB (fake-indexeddb.js).

export const DB_NAME = "involo";
/** 1: the flight log. 2: installed packs, beside it. */
export const DB_VERSION = 2;
export const LOG_STORE = "log";
export const PACK_STORE = "packs";

/** Opens the database, creating any store it doesn't have yet. */
export function open(idb) {
  return new Promise((resolve, reject) => {
    const request = idb.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of [LOG_STORE, PACK_STORE])
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
    };
    request.onsuccess = () => {
      const db = request.result;
      // Another tab opening a later version: let go, so its upgrade isn't held up.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      // Close the connection if it opens after all, so it never holds the database.
      request.onsuccess = () => request.result.close();
      reject(new Error("the app's database is blocked"));
    };
  });
}

/** Runs one request on `store` and resolves with its result once the transaction ends. */
export async function run(idb, store, mode, make) {
  const db = await open(idb);
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const request = make(tx.objectStore(store));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error ?? request.error);
      tx.onabort = () => reject(tx.error ?? new Error("the transaction was aborted"));
    });
  } finally {
    db.close();
  }
}
