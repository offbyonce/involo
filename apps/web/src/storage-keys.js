// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Where this device's saved data lives, and the move from the app's old name (decision 0025).
// Plain JavaScript, so Node's test runner covers it with a fake storage (storage-keys.test.js).
//
// Before the rename every key started "chocktochock." (progress, settings, the kept plan, and any
// text moved aside as ".kept-<time>"). The site stays on the same origin, so those keys are still
// reachable. On start, every old key is copied to the same name under "involo.", each copy is read
// back, a marker records that the copy is complete, and only then are the old keys removed. If any
// step fails, the app keeps using the old keys this visit and tries again next time; new keys left
// by a failed attempt are overwritten then, because nothing writes them until the copy is complete.
// Once the marker is set, old keys still there (a removal that failed) are only removed: by then
// the new keys may hold newer saves, so the old ones are never copied again.

export const OLD_PREFIX = "chocktochock.";
export const NEW_PREFIX = "involo.";
export const MARKER = `${NEW_PREFIX}renamed`;

/** Every key in a storage that starts with a prefix. */
function keysWith(storage, prefix) {
  const keys = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k?.startsWith(prefix)) keys.push(k);
  }
  return keys;
}

/** Moves saved data to the new name. Returns the prefix the app should use this visit. */
export function migrateStorage(storage) {
  let old;
  try {
    old = keysWith(storage, OLD_PREFIX);
  } catch {
    // Storage is blocked (private window): nothing is saved under either name.
    return NEW_PREFIX;
  }
  if (old.length === 0) return NEW_PREFIX;
  try {
    if (storage.getItem(MARKER) === null) {
      for (const k of old) {
        const text = storage.getItem(k);
        if (text === null) continue;
        const moved = NEW_PREFIX + k.slice(OLD_PREFIX.length);
        storage.setItem(moved, text);
        if (storage.getItem(moved) !== text) throw new Error(`copy of ${k} did not read back`);
      }
      storage.setItem(MARKER, new Date().toISOString());
      if (storage.getItem(MARKER) === null) throw new Error("marker did not read back");
    }
  } catch {
    return OLD_PREFIX;
  }
  for (const k of old) {
    try {
      storage.removeItem(k);
    } catch {
      // Removed on a later start; the data is already under the new name.
    }
  }
  return NEW_PREFIX;
}

let prefix = NEW_PREFIX;

/** Runs the move once at start, before anything reads or saves. */
export function prepareStorage(storage) {
  prefix = migrateStorage(storage);
  return prefix;
}

/** The full storage key for a name such as "settings" or "flight.<pack>". */
export function storageKey(name) {
  return prefix + name;
}
