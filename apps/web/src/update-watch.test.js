// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import { test } from "node:test";
import { reloadOnTakeover, watchForUpdates } from "./update-watch.js";

function worker() {
  const w = new EventTarget();
  w.state = "installing";
  w.install = () => {
    w.state = "installed";
    w.dispatchEvent(new Event("statechange"));
  };
  return w;
}

/** A fake registration and container; `found(w)` makes `w` the installing worker. */
function fakes({ controller = null, installing = null, waiting = null } = {}) {
  const registration = new EventTarget();
  Object.assign(registration, { installing, waiting });
  const workers = { controller };
  const offered = [];
  watchForUpdates(workers, registration, (w) => offered.push(w));
  return {
    workers,
    offered,
    found(w) {
      registration.installing = w;
      registration.dispatchEvent(new Event("updatefound"));
    },
  };
}

test("the first install offers nothing, even when it takes the page before its events arrive", () => {
  // Seen in Firefox: the worker is already installing when the page starts watching, and by the
  // time "updatefound" and "installed" are delivered it controls the page.
  const first = worker();
  const f = fakes({ installing: first });
  f.workers.controller = first;
  f.found(first);
  first.install();
  assert.equal(f.offered.length, 0);
});

test("the first install offers nothing when it starts after the page does", () => {
  const first = worker();
  const f = fakes();
  f.found(first);
  f.workers.controller = first;
  first.install();
  assert.equal(f.offered.length, 0);
});

test("a later version in the same first visit is offered", () => {
  const first = worker();
  const f = fakes({ installing: first });
  f.workers.controller = first;
  f.found(first);
  first.install();
  const next = worker();
  f.found(next);
  next.install();
  assert.deepEqual(f.offered, [next]);
});

test("a new version found while an older one runs is offered once installed", () => {
  const f = fakes({ controller: {} });
  const next = worker();
  f.found(next);
  assert.equal(f.offered.length, 0);
  next.install();
  assert.deepEqual(f.offered, [next]);
});

test("a version already waiting at load is offered", () => {
  const waiting = {};
  const f = fakes({ controller: {}, waiting });
  assert.deepEqual(f.offered, [waiting]);
});

/** A fake container: `take(w)` makes `w` the controller and fires controllerchange. */
function container(controller = null) {
  const workers = new EventTarget();
  workers.controller = controller;
  workers.take = (w) => {
    workers.controller = w;
    workers.dispatchEvent(new Event("controllerchange"));
  };
  return workers;
}

test("a tab on the old version reloads when the new one takes over, whichever tab pressed Reload (#68)", () => {
  const workers = container(worker());
  let reloads = 0;
  reloadOnTakeover(workers, () => reloads++);
  workers.take(worker());
  assert.equal(reloads, 1);
});

test("the first install takes over the page without reloading it; a later update then does", () => {
  const workers = container(null);
  let reloads = 0;
  reloadOnTakeover(workers, () => reloads++);
  workers.take(worker());
  assert.equal(reloads, 0, "the first install runs the version already loaded");
  workers.take(worker());
  assert.equal(reloads, 1, "a version installed after that takes over from a running one");
});
