// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The flight log on this device (decision 0026), in IndexedDB under the app's own name: a full
// log (500 flights with every tick) is far larger than the few megabytes browser storage holds
// for a site. Nothing here leaves the device. The log is kept as the JSON text Rust writes and
// reads (format, migrations), so this file only stores and fetches it.
// The database is opened in app-db.js, shared with the installed packs. Plain JavaScript, so
// Node's test runner covers it with a fake IndexedDB (log-store.test.js).
// With no IndexedDB at all (some private windows) there is no log and saving reports that nothing
// was kept. A database that is there but fails to read is an error, never "no log": the app then
// keeps whatever is saved and saves nothing over it.

import { LOG_STORE, run } from "./app-db.js";

export { DB_NAME } from "./app-db.js";
export const STORE = LOG_STORE;
export const KEY = "log";

/** The saved log's text, or null when there is none (or no IndexedDB). Rejects when the database
 * fails to open or read, or holds something that isn't the log's text. */
export async function readLog(idb = globalThis.indexedDB) {
  if (!idb) return null;
  const text = await run(idb, STORE, "readonly", (store) => store.get(KEY));
  if (text === undefined) return null;
  if (typeof text !== "string") throw new Error("the saved log is not text");
  return text;
}

/** Saves the log's text. Resolves true when it was kept, false when the database refused. */
export async function writeLog(text, idb = globalThis.indexedDB) {
  if (!idb) return false;
  try {
    await run(idb, STORE, "readwrite", (store) => store.put(text, KEY));
    return true;
  } catch {
    return false;
  }
}
