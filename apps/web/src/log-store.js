// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The flight log on this device (decision 0026), in IndexedDB under the app's own name: a full
// log (500 flights with every tick) is far larger than the few megabytes browser storage holds
// for a site. Nothing here leaves the device. The log is kept as the JSON text Rust writes and
// reads (format, migrations), so this file only stores and fetches it.
// Plain JavaScript, so Node's test runner covers it with a fake IndexedDB (log-store.test.js).
// With no IndexedDB at all (some private windows) there is no log and saving reports that nothing
// was kept. A database that is there but fails to read is an error, never "no log": the app then
// keeps whatever is saved and saves nothing over it.

export const DB_NAME = "involo";
export const STORE = "log";
export const KEY = "log";

/** Opens the database, creating the log's store the first time. */
function open(idb) {
  return new Promise((resolve, reject) => {
    const request = idb.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      // Close the connection if it opens after all, so it never holds the database.
      request.onsuccess = () => request.result.close();
      reject(new Error("the log's database is blocked"));
    };
  });
}

/** Runs one request in a transaction and resolves with its result once the transaction ends. */
async function run(idb, mode, make) {
  const db = await open(idb);
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = make(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error ?? request.error);
      tx.onabort = () => reject(tx.error ?? new Error("the log's transaction was aborted"));
    });
  } finally {
    db.close();
  }
}

/** The saved log's text, or null when there is none (or no IndexedDB). Rejects when the database
 * fails to open or read, or holds something that isn't the log's text. */
export async function readLog(idb = globalThis.indexedDB) {
  if (!idb) return null;
  const text = await run(idb, "readonly", (store) => store.get(KEY));
  if (text === undefined) return null;
  if (typeof text !== "string") throw new Error("the saved log is not text");
  return text;
}

/** Saves the log's text. Resolves true when it was kept, false when the database refused. */
export async function writeLog(text, idb = globalThis.indexedDB) {
  if (!idb) return false;
  try {
    await run(idb, "readwrite", (store) => store.put(text, KEY));
    return true;
  } catch {
    return false;
  }
}
