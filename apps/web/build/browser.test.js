// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The review shots' page steps (#189): data goes to the page as a WebDriver BiDi argument, never
// spliced into code.

import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { bidiValue, firefoxCommand } from "./browser.mjs";
import * as scenes from "./scenes.mjs";

test("a page argument is sent as WebDriver BiDi local values, nested", () => {
  assert.deepEqual(
    bidiValue({ selector: 'a[title="x"]', n: 2, on: true, none: null, list: ["</script>", 1] }),
    {
      type: "object",
      value: [
        ["selector", { type: "string", value: 'a[title="x"]' }],
        ["n", { type: "number", value: 2 }],
        ["on", { type: "boolean", value: true }],
        ["none", { type: "null" }],
        [
          "list",
          {
            type: "array",
            value: [
              { type: "string", value: "</script>" },
              { type: "number", value: 1 },
            ],
          },
        ],
      ],
    },
  );
  assert.deepEqual(bidiValue(undefined), { type: "undefined" });
  assert.deepEqual(bidiValue(Number.NaN), { type: "number", value: "NaN" });
  assert.throws(() => bidiValue(() => 1), /can't be a function/);
});

test("a step that takes data carries it as its argument, beside a function", () => {
  const step = scenes.click('button[aria-label="Download iFly 737 MAX 8"]', 1);
  assert.equal(typeof step.fn, "function");
  assert.deepEqual(step.arg, { selector: 'button[aria-label="Download iFly 737 MAX 8"]', n: 1 });
  // The selector is nowhere in the function's own code.
  assert.ok(!String(step.fn).includes("Download iFly"));
});

test("every scene is fixed scripts, functions with their data, or keys", () => {
  const steps = (v) => (Array.isArray(v) ? v.flatMap(steps) : [v]);
  for (const [name, value] of Object.entries(scenes)) {
    if (!Array.isArray(value) && (typeof value !== "object" || value === null || !("fn" in value))) continue;
    for (const step of steps(value)) {
      const ok =
        typeof step === "string" ||
        (typeof step === "object" && typeof step.fn === "function" && !("keys" in step)) ||
        (typeof step === "object" && Array.isArray(step.keys));
      assert.ok(ok, `${name}: ${JSON.stringify(step)?.slice(0, 80)}`);
    }
  }
});

// Which Firefox the update test starts (#41): CI runs it in the Playwright image, whose Firefox
// lives under PLAYWRIGHT_BROWSERS_PATH with a build number in its folder name.
test("FIREFOX wins, then the newest Playwright Firefox build, then firefox on the PATH", () => {
  const dir = "/ms-playwright";
  const files = new Set([
    path.join(dir, "firefox-1490", "firefox", "firefox"),
    path.join(dir, "firefox-1572", "firefox", "firefox"),
  ]);
  const exists = (f) => f === dir || files.has(f);
  const list = () => ["chromium-1255", "firefox-1490", "firefox-1572", "webkit-2388", "firefox-9x"];
  assert.equal(
    firefoxCommand({ FIREFOX: "/opt/ff/firefox", PLAYWRIGHT_BROWSERS_PATH: dir }, exists, list),
    "/opt/ff/firefox",
  );
  assert.equal(
    firefoxCommand({ PLAYWRIGHT_BROWSERS_PATH: dir }, exists, list),
    path.join(dir, "firefox-1572", "firefox", "firefox"),
  );
  // No Firefox build there, or the browsers kept in node_modules: the PATH's.
  assert.equal(
    firefoxCommand({ PLAYWRIGHT_BROWSERS_PATH: dir }, () => false, list),
    "firefox",
  );
  assert.equal(firefoxCommand({ PLAYWRIGHT_BROWSERS_PATH: "0" }, exists, list), "firefox");
  assert.equal(firefoxCommand({}, exists, list), "firefox");
});
