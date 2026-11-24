// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  browserStorage,
  names,
  readText,
  savedStore,
  saveOver,
  setAsideText,
  writeText,
} from "./saved-store.js";
import { storageKey } from "./storage-keys.js";

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
    get length() {
      if (failOn("list")) throw new Error("blocked");
      return map.size;
    },
    key(i) {
      return [...map.keys()][i] ?? null;
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

// The store saved.ts uses (#58): the same rules, by item name, over the storage it is given.

/** A store over `s`, with the set-aside time fixed. */
const storeOver = (s) => savedStore(() => s, NOW);

test("each item is kept under its own key: the settings once for every pack, a flight and a plan per pack", () => {
  assert.equal(storageKey(names.settings), "involo.settings");
  assert.equal(storageKey(names.flight("demo")), "involo.flight.demo");
  assert.equal(storageKey(names.plan("demo")), "involo.plan.demo");
  const s = fakeStorage();
  const store = storeOver(s);
  assert.equal(store.save(names.settings, "{}"), "saved");
  assert.equal(store.save(names.flight("demo"), "f"), "saved");
  assert.equal(store.write(names.plan("demo"), "p"), true);
  assert.deepEqual([...s.map.keys()], ["involo.settings", "involo.flight.demo", "involo.plan.demo"]);
  assert.equal(store.read(names.flight("demo")), "f");
  // Set aside under the item's own key.
  assert.equal(store.setAside(names.flight("demo")), true);
  assert.equal(s.map.get("involo.flight.demo.kept-2026-11-17T10:00:00.000Z"), "f");
});

test("a save the storage refuses (full) fails, and the next save still goes over what is there", () => {
  let full = true;
  const s = fakeStorage({ "involo.flight.demo": "old" }, (op) => full && op === "set");
  const store = storeOver(s);
  assert.equal(store.read(names.flight("demo")), "old");
  assert.equal(store.save(names.flight("demo"), "new"), "failed");
  assert.equal(s.map.get("involo.flight.demo"), "old");
  // Not "changed": the store still knows the stored text is the one it read.
  full = false;
  assert.equal(store.save(names.flight("demo"), "new"), "saved");
  assert.equal(s.map.get("involo.flight.demo"), "new");
});

test("a save that reads back wrong fails", () => {
  const s = fakeStorage({}, (op) => op === "readback");
  assert.equal(storeOver(s).save(names.settings, "{}"), "failed");
});

test("a save over text another window saved is refused, and nothing is written", () => {
  const s = fakeStorage({ "involo.flight.demo": "mine" });
  const store = storeOver(s);
  store.read(names.flight("demo"));
  s.setItem("involo.flight.demo", "theirs");
  assert.equal(store.save(names.flight("demo"), "mine + a tick"), "changed");
  assert.equal(s.map.get("involo.flight.demo"), "theirs");
  // Read again (the app loads what is there), and the save goes over that.
  assert.equal(store.read(names.flight("demo")), "theirs");
  assert.equal(store.save(names.flight("demo"), "theirs + a tick"), "saved");
});

test("blocked storage (none, or every accessor throws): nothing is read, and every change fails", () => {
  const blocked = [
    savedStore(() => null, NOW),
    storeOver(fakeStorage({ "involo.flight.demo": "f" }, () => true)),
  ];
  for (const store of blocked) {
    assert.equal(store.read(names.flight("demo")), null);
    assert.equal(store.save(names.flight("demo"), "x"), "failed");
    assert.equal(store.write(names.plan("demo"), "p"), false);
    assert.equal(store.remove(names.plan("demo")), false);
    assert.equal(store.setAside(names.flight("demo")), false);
    assert.deepEqual(store.savedPacks(), []);
  }
});

test("a set-aside that can't store its copy keeps the original, and saves still go over it", () => {
  const s = fakeStorage(
    { "involo.flight.demo": "unreadable" },
    (op, k) => op === "set" && k.includes(".kept-"),
  );
  const store = storeOver(s);
  store.read(names.flight("demo"));
  assert.equal(store.setAside(names.flight("demo")), false);
  assert.equal(s.map.get("involo.flight.demo"), "unreadable");
  assert.equal(store.save(names.flight("demo"), "fresh"), "saved");
});

test("after a set-aside or a removal, a save starts the item afresh", () => {
  const s = fakeStorage({ "involo.flight.demo": "f", "involo.plan.demo": "p" });
  const store = storeOver(s);
  store.read(names.flight("demo"));
  assert.equal(store.setAside(names.flight("demo")), true);
  assert.equal(store.save(names.flight("demo"), "new"), "saved");
  assert.equal(store.remove(names.flight("demo")), true);
  assert.equal(store.remove(names.plan("demo")), true);
  assert.equal(store.save(names.flight("demo"), "again"), "saved");
  assert.equal(store.read(names.plan("demo")), null);
});

test("the packs with a saved flight, sorted; set-aside copies, plans and settings don't count", () => {
  const s = fakeStorage({
    "involo.flight.zulu": "z",
    "involo.flight.alpha": "a",
    "involo.flight.alpha.kept-2026-11-01T00:00:00.000Z": "old",
    "involo.plan.bravo": "p",
    "involo.settings": "{}",
    "other.flight.charlie": "x",
  });
  assert.deepEqual(storeOver(s).savedPacks(), ["alpha", "zulu"]);
  assert.deepEqual(
    storeOver(fakeStorage({ "involo.flight.alpha": "a" }, (op) => op === "list")).savedPacks(),
    [],
  );
});

test("outside a browser there is no storage", () => {
  assert.equal(browserStorage(), null);
});

test("saved.ts reaches browser storage only through the store", () => {
  const text = readFileSync(new URL("./saved.ts", import.meta.url), "utf8");
  assert.ok(!/localStorage|sessionStorage/.test(text));
});
