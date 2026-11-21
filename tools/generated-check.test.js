// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// `just generated-check`'s two checks, in a scratch git repository: a generated file that differs
// from the committed one, and one that was never added to git, each fail; files outside the
// generated paths, and a new file that is staged, don't.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { generatedCheck } from "./generated-check.mjs";

/** A scratch repository with one committed generated file, `gen/a.md`. */
function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "generated-check-"));
  const git = (...args) => {
    const r = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  };
  git("init", "-q");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "Test");
  fs.mkdirSync(path.join(dir, "gen"));
  fs.writeFileSync(path.join(dir, "gen", "a.md"), "a\n");
  git("add", "-A");
  git("commit", "-q", "-m", "start");
  return { dir, git };
}

test("committed generated files pass", () => {
  const { dir } = repo();
  assert.deepEqual(generatedCheck(["gen"], dir), { ok: true, messages: [] });
});

test("a generated file that differs from the committed one fails", () => {
  const { dir } = repo();
  fs.writeFileSync(path.join(dir, "gen", "a.md"), "changed\n");
  const r = generatedCheck(["gen"], dir);
  assert.equal(r.ok, false);
  assert.match(r.messages.join("\n"), /differ from what is committed/);
});

test("a generated file never added to git fails, and is named", () => {
  const { dir } = repo();
  fs.writeFileSync(path.join(dir, "gen", "new.md"), "new\n");
  const r = generatedCheck(["gen"], dir);
  assert.equal(r.ok, false);
  assert.ok(r.messages.includes("gen/new.md"), r.messages.join("\n"));
  assert.match(r.messages.join("\n"), /not added to git/);
});

test("files outside the generated paths, and a staged new file, pass", () => {
  const { dir, git } = repo();
  fs.writeFileSync(path.join(dir, "elsewhere.md"), "x\n");
  fs.writeFileSync(path.join(dir, "gen", "staged.md"), "s\n");
  git("add", "gen/staged.md");
  assert.deepEqual(generatedCheck(["gen"], dir), { ok: true, messages: [] });
});
