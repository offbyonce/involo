// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The review shots' page steps (#189): data goes to the page as a WebDriver BiDi argument, never
// spliced into code.

import assert from "node:assert/strict";
import { test } from "node:test";
import { bidiValue } from "./browser.mjs";
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
