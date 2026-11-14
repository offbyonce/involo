// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Where this device's saved data lives, and the move from the app's old name (decision 0025).
// Plain JavaScript, so Node's test runner covers it with a fake storage (storage-keys.test.js).
//
// Before the rename every key started "chocktochock." (progress, settings, the kept plan, and any
// text moved aside as ".kept-<time>"). The site stays on the same origin, so those keys are still
// reachable. On start, every old key is copied to the same name under "involo.", each copy is read
// back, a marker records that the copy is complete, and only then are the old keys removed. If any
// step fails, the copies made so far are removed again (they would only take space) and the app
// keeps using the old keys this visit and tries again next time.
//
// Once the marker is set, an old key can still appear: a removal that failed, or a save from the
// old version still open in another tab or at the old address. It is never dropped (decision
// 0012): copied when the new name has nothing, removed when the new name holds the same text, and
// otherwise moved aside under the new name as ".kept-<time>", like other saved text the app keeps.

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

/** Writes a value and checks it reads back. */
function put(storage, key, text) {
  storage.setItem(key, text);
  if (storage.getItem(key) !== text) throw new Error(`${key} did not read back`);
}

/** The first move: copy everything, check it, set the marker. Undoes its copies on failure. */
function copyAll(storage, old, now) {
  const copied = [];
  try {
    for (const k of old) {
      const text = storage.getItem(k);
      if (text === null) continue;
      const moved = NEW_PREFIX + k.slice(OLD_PREFIX.length);
      copied.push(moved);
      put(storage, moved, text);
    }
    put(storage, MARKER, now());
  } catch (e) {
    for (const k of copied) {
      try {
        storage.removeItem(k);
      } catch {
        // Overwritten by the next attempt.
      }
    }
    throw e;
  }
}

/** After the move: keeps an old key's text under the new name, then removes the old key. */
function keepLate(storage, k, now) {
  const text = storage.getItem(k);
  if (text !== null) {
    const moved = NEW_PREFIX + k.slice(OLD_PREFIX.length);
    const current = storage.getItem(moved);
    if (current === null) put(storage, moved, text);
    else if (current !== text) put(storage, `${moved}.kept-${now()}`, text);
  }
  storage.removeItem(k);
}

/** Moves saved data to the new name. Returns the prefix the app should use this visit. */
export function migrateStorage(storage, now = () => new Date().toISOString()) {
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
      copyAll(storage, old, now);
    }
  } catch {
    return OLD_PREFIX;
  }
  for (const k of old) {
    try {
      keepLate(storage, k, now);
    } catch {
      // Left for a later start; the new name already holds everything copied.
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
