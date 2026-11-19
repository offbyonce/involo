// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Installed packs on this device (decision 0028), in the app's IndexedDB beside the flight log.
// One record per pack id, so installing a second version replaces the first. A record keeps the
// pack file's text as it was checked, its summary, where it came from ("catalog", or "file" for a
// pack the pilot chose) and when it was installed. Rust checks a pack before it is kept and reads
// it when it is opened, so this file only stores and fetches. Nothing here leaves the device.
// With no IndexedDB at all (some private windows) no pack is installed and installing reports that
// nothing was kept. A database that fails to read is an error, never "no packs".
// Plain JavaScript, so Node's test runner covers it with a fake IndexedDB (pack-store.test.js).

import { PACK_STORE, run } from "./app-db.js";

export { DB_NAME } from "./app-db.js";
export const STORE = PACK_STORE;

/** Whether a stored value is a pack record this version can use. */
function isRecord(r) {
  return (
    typeof r === "object" &&
    r !== null &&
    typeof r.text === "string" &&
    typeof r.summary?.id === "string" &&
    (r.source === "catalog" || r.source === "file") &&
    typeof r.installedAt === "number"
  );
}

/** Every installed pack, without its text, by id. Empty with no IndexedDB. Rejects when the
 * database fails to open or read. */
export async function readPacks(idb = globalThis.indexedDB) {
  if (!idb) return [];
  const all = await run(idb, STORE, "readonly", (store) => store.getAll());
  return all
    .filter(isRecord)
    .map(({ summary, source, installedAt }) => ({ summary, source, installedAt }))
    .sort((a, b) => (a.summary.id < b.summary.id ? -1 : a.summary.id > b.summary.id ? 1 : 0));
}

/** The installed pack's file text, or null when it isn't installed (or no IndexedDB). */
export async function readPackText(id, idb = globalThis.indexedDB) {
  if (!idb) return null;
  const record = await run(idb, STORE, "readonly", (store) => store.get(id));
  return isRecord(record) ? record.text : null;
}

/** Keeps a checked pack, replacing any version of the same id. Resolves true when it was kept,
 * false when there is no IndexedDB or the database refused. */
export async function writePack(record, idb = globalThis.indexedDB) {
  if (!idb) return false;
  try {
    await run(idb, STORE, "readwrite", (store) => store.put(record, record.summary.id));
    return true;
  } catch {
    return false;
  }
}

/** Removes an installed pack. Resolves false when the database refused. */
export async function deletePack(id, idb = globalThis.indexedDB) {
  if (!idb) return false;
  try {
    await run(idb, STORE, "readwrite", (store) => store.delete(id));
    return true;
  } catch {
    return false;
  }
}
