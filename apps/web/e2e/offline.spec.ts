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
  // The app's old address (#246) goes to the app, offline too.
  await page.goto("./app/");
  await expect.poll(() => new URL(page.url()).pathname).toBe("/");
  await expect(tickedOf(page, "BATTERY switch"), "the same app, with the tick").toBeVisible();
  await context.setOffline(false);
});

test("the worker answers only the app's own address with the app (#246)", async ({ app, page }) => {
  await app.firstRun();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  // Another page of the site is itself, not the app.
  await page.goto("./design/?view=gate");
  await expect(page.locator("#gallery")).toBeAttached();
  await expect(page.locator("#app")).toHaveCount(0);
  // The old address, online, also lands on the app.
  await page.goto("./app/");
  await expect.poll(() => new URL(page.url()).pathname).toBe("/");
  await expect(page.locator("#app")).toBeAttached();
});
