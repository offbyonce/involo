// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The browser storage rules for progress, settings and the kept plan (decision 0012), apart from
// the WebAssembly reads in saved.ts. Plain JavaScript, so Node's test runner covers it with a fake
// storage (saved-store.test.js). Every access is guarded: storage can be blocked (private windows)
// or full.
//
// - A write counts only once it reads back the same.
// - Text moved aside is copied and checked first; the original is removed only after that.
// - A window saves only over the text it last read or wrote. If another window saved since, the
//   write is refused, so the caller can load what is there instead of erasing it.

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
