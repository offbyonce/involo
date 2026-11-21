// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { expect, test } from "./fixtures";

// The drawing gallery (#192): with the iFly pack installed, as `just drawing-shots` installs it,
// it draws every control state and the pack's views in both themes and logs no console errors
// (a negative SVG size was one).

test("the drawing gallery draws with no console errors, in both themes (#192)", async ({ app, page }) => {
  await app.firstRun();
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  for (const theme of ["dark", "light"]) {
    await page.goto(`../design/?theme=${theme}`);
    await expect(page.locator("[data-gallery-ready]")).toBeAttached();
    await expect(page.locator("[data-cell]").first()).toBeVisible();
    await page.waitForTimeout(500);
  }
  expect(errors).toEqual([]);
});
