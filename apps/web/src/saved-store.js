// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The browser storage rules for progress, settings and the kept plan (decision 0012), apart from
// the WebAssembly reads in saved.ts. Plain JavaScript, so Node's test runner covers it with a fake
// storage (saved-store.test.js). Every access is guarded: storage can be blocked (private windows)
// or full. `savedStore` is the store saved.ts uses, over the storage it is given; `browserStorage`
// is the only place that reaches the browser's own.
//
// - A write counts only once it reads back the same.
// - Text moved aside is copied and checked first; the original is removed only after that.
// - A window saves only over the text it last read or wrote. If another window saved since, the
//   write is refused, so the caller can load what is there instead of erasing it.

import { storageKey } from "./storage-keys.js";

/** The browser's storage, or null when it is blocked (private windows) or there is none. */
export function browserStorage() {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The text under a key, or null when there is none or storage is blocked. */
export function readText(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/** Writes text and checks it reads back. False when storage refused it or it reads back wrong. */
export function writeText(storage, key, text) {
  try {
    storage.setItem(key, text);
    return storage.getItem(key) === text;
  } catch {
    return false;
  }
}

/**
 * Saves text over `seen`, the text this window last read or wrote (null: nothing was there).
 * "saved" when it is stored, "failed" when storage refused it, "changed" when the stored text is
 * not `seen` (another window saved since): then nothing is written.
 */
export function saveOver(storage, key, text, seen) {
  let current;
  try {
    current = storage.getItem(key);
  } catch {
    return "failed";
  }
  if (current !== seen) return "changed";
  return writeText(storage, key, text) ? "saved" : "failed";
}

/**
 * Moves the text under a key aside to `<key>.kept-<time>`. The copy is written and read back
 * first; only then is the original removed. True when it was moved (or nothing was there); false
 * when the copy could not be stored, and then the original is left as it was.
 */
export function setAsideText(storage, key, now = () => new Date().toISOString()) {
  let text;
  try {
    text = storage.getItem(key);
  } catch {
    return false;
  }
  if (text === null) return true;
  const copy = `${key}.kept-${now()}`;
  if (!writeText(storage, copy, text)) {
    try {
      storage.removeItem(copy);
    } catch {
      // Nothing was stored there.
    }
    return false;
  }
  try {
    storage.removeItem(key);
  } catch {
    // The original stays; remove the copy so the same text isn't kept twice.
    try {
      storage.removeItem(copy);
    } catch {
      // Left as a second copy: nothing is lost.
    }
    return false;
  }
  return true;
}

/** The name each saved item is kept under, before the storage prefix (`storageKey`). The settings
 * are one item for every pack. */
export const names = {
  settings: "settings",
  flight: (pack) => `flight.${pack}`,
  plan: (pack) => `plan.${pack}`,
};

/**
 * The saved items, by name (`names`), in the storage `storage()` answers (null: blocked). The
 * store remembers the text it last read or wrote under each name, so a save goes only over that
 * (`saveOver`).
 */
export function savedStore(storage, now = () => new Date().toISOString()) {
  /** The text last read or written under each name. */
  const seen = new Map();

  return {
    /** The text saved under a name, or null when there is none or storage is blocked. */
    read(name) {
      const s = storage();
      const text = s ? readText(s, storageKey(name)) : null;
      seen.set(name, text);
      return text;
    },

    /** Saves text over what this store last saw: "saved", "failed" (blocked, refused, or it read
     * back wrong) or "changed" (saved elsewhere since; nothing is written). */
    save(name, text) {
      const s = storage();
      if (!s) return "failed";
      const result = saveOver(s, storageKey(name), text, seen.get(name) ?? null);
      if (result === "saved") seen.set(name, text);
      return result;
    },

    /** Writes text whatever is there (the kept plan). False when storage refused it. */
    write(name, text) {
      const s = storage();
      return s ? writeText(s, storageKey(name), text) : false;
    },

    /** Removes what is saved under a name. False when storage refused it or is blocked. */
    remove(name) {
      const s = storage();
      if (!s) return false;
      try {
        s.removeItem(storageKey(name));
      } catch {
        return false;
      }
      seen.set(name, null);
      return true;
    },

    /** Moves saved text aside (`setAsideText`). False when its copy couldn't be stored, and then
     * nothing is moved. */
    setAside(name) {
      const s = storage();
      if (!s || !setAsideText(s, storageKey(name), now)) return false;
      seen.set(name, null);
      return true;
    },

    /** The packs with a flight saved, by id, sorted; set-aside copies don't count. */
    savedPacks() {
      const s = storage();
      if (!s) return [];
      const prefix = storageKey(names.flight(""));
      const ids = [];
      try {
        for (let i = 0; i < s.length; i++) {
          const k = s.key(i);
          if (k?.startsWith(prefix) && !k.includes(".kept-")) ids.push(k.slice(prefix.length));
        }
      } catch {
        return [];
      }
      return ids.sort();
    },
  };
}
