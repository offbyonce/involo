// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import { test } from "node:test";
import { readText, saveOver, setAsideText, writeText } from "./saved-store.js";

/** A fake localStorage; `failOn(op, key)` makes that call throw (or, for "readback", read back wrong). */
function fakeStorage(entries = {}, failOn = () => false) {
  const map = new Map(Object.entries(entries));
  return {
    map,
    getItem(k) {
      if (failOn("get", k)) throw new Error("blocked");
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      if (failOn("set", k)) throw new Error("quota");
      map.set(k, failOn("readback", k) ? `${v}-damaged` : v);
    },
    removeItem(k) {
      if (failOn("remove", k)) throw new Error("remove failed");
      map.delete(k);
    },
  };
}

const KEY = "involo.flight.demo";
const NOW = () => "2026-11-17T10:00:00.000Z";

test("set aside: the copy holds the same text under <key>.kept-<time>, and the original is gone", () => {
  const s = fakeStorage({ [KEY]: '{"format":9}' });
  assert.equal(setAsideText(s, KEY, NOW), true);
  assert.equal(s.map.get(`${KEY}.kept-2026-11-17T10:00:00.000Z`), '{"format":9}');
  assert.equal(s.map.has(KEY), false);
});

test("set aside with storage that refuses writes: the original is untouched and it reports failure", () => {
  const s = fakeStorage({ [KEY]: '{"format":9}' }, (op) => op === "set");
  assert.equal(setAsideText(s, KEY, NOW), false);
  assert.deepEqual(Object.fromEntries(s.map), { [KEY]: '{"format":9}' });
});

test("set aside with a copy that reads back wrong: the original stays, the bad copy is removed", () => {
  const s = fakeStorage({ [KEY]: "text" }, (op, k) => op === "readback" && k !== KEY);
  assert.equal(setAsideText(s, KEY, NOW), false);
  assert.deepEqual(Object.fromEntries(s.map), { [KEY]: "text" });
});

test("set aside when the original can't be removed: it stays, and the copy is not kept twice", () => {
  const s = fakeStorage({ [KEY]: "text" }, (op, k) => op === "remove" && k === KEY);
  assert.equal(setAsideText(s, KEY, NOW), false);
  assert.deepEqual(Object.fromEntries(s.map), { [KEY]: "text" });
});

test("set aside with nothing saved, or blocked storage", () => {
  assert.equal(setAsideText(fakeStorage(), KEY, NOW), true);
  assert.equal(
    setAsideText(
      fakeStorage({ [KEY]: "x" }, (op) => op === "get"),
      KEY,
      NOW,
    ),
    false,
  );
});

test("a write counts only when it is stored and reads back", () => {
  const ok = fakeStorage();
  assert.equal(writeText(ok, KEY, "a"), true);
  assert.equal(ok.map.get(KEY), "a");
  assert.equal(
    writeText(
      fakeStorage({}, (op) => op === "set"),
      KEY,
      "a",
    ),
    false,
    "refused",
  );
  assert.equal(
    writeText(
      fakeStorage({}, (op) => op === "readback"),
      KEY,
      "a",
    ),
    false,
    "read back wrong",
  );
  assert.equal(
    writeText(
      fakeStorage({}, (op) => op === "get"),
      KEY,
      "a",
    ),
    false,
    "blocked",
  );
});

test("reads are guarded", () => {
  assert.equal(readText(fakeStorage({ [KEY]: "a" }), KEY), "a");
  assert.equal(
    readText(
      fakeStorage({ [KEY]: "a" }, () => true),
      KEY,
    ),
    null,
  );
});

test("a save goes over the text this window last saw, and only that", () => {
  const s = fakeStorage();
  assert.equal(saveOver(s, KEY, "one", null), "saved");
  assert.equal(saveOver(s, KEY, "two", "one"), "saved");
  assert.equal(s.map.get(KEY), "two");
});

test("a save never writes over text changed since this window read it (another window saved)", () => {
  const s = fakeStorage({ [KEY]: "mine" });
  // This window read "mine"; another window then saves its own ticks.
  s.setItem(KEY, "theirs");
  assert.equal(saveOver(s, KEY, "mine + a tick", "mine"), "changed");
  assert.equal(s.map.get(KEY), "theirs");
  // Saved elsewhere where this window saw nothing.
  assert.equal(saveOver(fakeStorage({ [KEY]: "theirs" }), KEY, "mine", null), "changed");
});

test("a save to storage that refuses it, or is blocked, fails", () => {
  assert.equal(
    saveOver(
      fakeStorage({}, (op) => op === "set"),
      KEY,
      "a",
      null,
    ),
    "failed",
  );
  assert.equal(
    saveOver(
      fakeStorage({}, (op) => op === "readback"),
      KEY,
      "a",
      null,
    ),
    "failed",
  );
  assert.equal(
    saveOver(
      fakeStorage({}, (op) => op === "get"),
      KEY,
      "a",
      null,
    ),
    "failed",
  );
});
