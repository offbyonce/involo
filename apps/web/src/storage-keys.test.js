// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MARKER,
  migrateStorage,
  NEW_PREFIX,
  OLD_PREFIX,
  prepareStorage,
  storageKey,
} from "./storage-keys.js";

/** A fake localStorage; `failOn(op, key)` makes that call throw (or, for "readback", read back wrong). */
function fakeStorage(entries = {}, failOn = () => false) {
  const map = new Map(Object.entries(entries));
  return {
    map,
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem(k) {
      if (failOn("get", k)) throw new Error("get failed");
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

const OLD = {
  "chocktochock.settings": '{"theme":"dark"}',
  "chocktochock.flight.ifly-737-max8": '{"steps":1}',
  "chocktochock.plan.ifly-737-max8": '{"plan":2}',
  "chocktochock.flight.ifly-737-max8.kept-2026-11-01T00:00:00.000Z": "old text",
  "unrelated.key": "left alone",
};

test("old data present: copied under the new name, checked, then the old keys removed", () => {
  const s = fakeStorage(OLD);
  assert.equal(migrateStorage(s), NEW_PREFIX);
  assert.equal(s.map.get("involo.settings"), '{"theme":"dark"}');
  assert.equal(s.map.get("involo.flight.ifly-737-max8"), '{"steps":1}');
  assert.equal(s.map.get("involo.plan.ifly-737-max8"), '{"plan":2}');
  assert.equal(s.map.get("involo.flight.ifly-737-max8.kept-2026-11-01T00:00:00.000Z"), "old text");
  assert.ok(s.map.has(MARKER));
  assert.deepEqual(
    [...s.map.keys()].filter((k) => k.startsWith(OLD_PREFIX)),
    [],
  );
  assert.equal(s.map.get("unrelated.key"), "left alone");
});

test("already moved, or a new install: nothing to do", () => {
  const moved = fakeStorage({ "involo.settings": "new", [MARKER]: "2026-11-14" });
  assert.equal(migrateStorage(moved), NEW_PREFIX);
  assert.deepEqual(
    [...moved.map.entries()],
    [
      ["involo.settings", "new"],
      [MARKER, "2026-11-14"],
    ],
  );
  assert.equal(migrateStorage(fakeStorage()), NEW_PREFIX);
});

test("a copy that fails partway keeps the old data in use, untouched, and the next start finishes", () => {
  let full = true;
  const s = fakeStorage(OLD, (op, k) => full && op === "set" && k === "involo.plan.ifly-737-max8");
  assert.equal(migrateStorage(s), OLD_PREFIX);
  for (const [k, v] of Object.entries(OLD)) assert.equal(s.map.get(k), v);
  assert.ok(!s.map.has(MARKER));
  full = false;
  assert.equal(migrateStorage(s), NEW_PREFIX);
  assert.equal(s.map.get("involo.plan.ifly-737-max8"), '{"plan":2}');
  assert.ok(!s.map.has("chocktochock.settings"));
});

test("a copy that reads back wrong is a failure too", () => {
  const s = fakeStorage(OLD, (op, k) => op === "readback" && k === "involo.settings");
  assert.equal(migrateStorage(s), OLD_PREFIX);
  assert.equal(s.map.get("chocktochock.settings"), '{"theme":"dark"}');
  assert.ok(!s.map.has(MARKER));
});

test("a removal that fails after the copy: the new data is used and never overwritten by the old", () => {
  let stuck = true;
  const s = fakeStorage(OLD, (op, k) => stuck && op === "remove" && k === "chocktochock.settings");
  assert.equal(migrateStorage(s), NEW_PREFIX);
  assert.ok(s.map.has("chocktochock.settings"));
  s.map.set("involo.settings", '{"theme":"light"}'); // saved after the move
  stuck = false;
  assert.equal(migrateStorage(s), NEW_PREFIX);
  assert.equal(s.map.get("involo.settings"), '{"theme":"light"}');
  assert.ok(!s.map.has("chocktochock.settings"));
});

test("blocked storage, and the keys the app uses after the move", () => {
  const blocked = fakeStorage(OLD);
  Object.defineProperty(blocked, "length", {
    get() {
      throw new Error("SecurityError");
    },
  });
  assert.equal(migrateStorage(blocked), NEW_PREFIX);
  prepareStorage(fakeStorage(OLD, (op) => op === "set"));
  assert.equal(storageKey("settings"), "chocktochock.settings");
  prepareStorage(fakeStorage(OLD));
  assert.equal(storageKey("flight.ifly-737-max8"), "involo.flight.ifly-737-max8");
});
