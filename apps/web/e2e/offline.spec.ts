// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { expect, test, tickedOf, tickOf } from "./fixtures";

test("offline: loaded once, the app still starts with no network", async ({ app, page, context }) => {
  await app.firstRun();
  await tickOf(page, "BATTERY switch").click();
  // Once the service worker has the app's files, the app needs nothing from the network.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), {
      message: "the service worker controls the page",
    })
    .toBe(true);
  await context.setOffline(true);
  await app.reload();
  await expect(page.getByRole("heading", { level: 1 }), "the checklist shows offline").toBeVisible();
  await expect(tickedOf(page, "BATTERY switch"), "with the saved tick").toBeVisible();
  await context.setOffline(false);
});
