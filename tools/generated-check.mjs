// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// `just generated-check`, after the recipe has regenerated every generated file: fails when a
// generated file differs from what is committed, or when one was never added to git (a new
// schema or reference page left untracked would pass the diff unnoticed). Node rather than shell
// syntax, so the recipe runs the same under PowerShell on Windows as under sh elsewhere.
//
//   node tools/generated-check.mjs <path>...

import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/**
 * Checks the generated files under `paths` in the git repository at `cwd`.
 * @param {string[]} paths
 * @param {string} [cwd]
 * @returns {{ ok: boolean, messages: string[] }}
 */
export function generatedCheck(paths, cwd = process.cwd()) {
  const git = (args) => {
    const r = spawnSync("git", args, { cwd, encoding: "utf8" });
    if (r.error) throw r.error;
    return r;
  };
  const messages = [];
  const diff = git(["diff", "--exit-code", "--", ...paths]);
  if (diff.status !== 0) {
    messages.push(diff.stdout.trim(), "generated files differ from what is committed: regenerate them and commit the result");
  }
  const others = git(["ls-files", "--others", "--exclude-standard", "--", ...paths]);
  const untracked = others.stdout.split("\n").filter((l) => l.trim() !== "");
  if (others.status !== 0 || untracked.length > 0) {
    messages.push(...untracked, "generated files above are not added to git");
  }
  return { ok: messages.length === 0, messages };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const paths = process.argv.slice(2);
  if (paths.length === 0) {
    console.error("usage: node tools/generated-check.mjs <path>...");
    process.exit(2);
  }
  const { ok, messages } = generatedCheck(paths);
  for (const m of messages) console.error(m);
  process.exit(ok ? 0 : 1);
}
