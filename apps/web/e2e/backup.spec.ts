// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { App, expect, IFLY, saved, test, tickedIds, tickedOf, tickOf } from "./fixtures";

// Back up and restore (#47): a backup saved in one browser, restored into a fresh one, gives back
// the same flight and settings.

test("a backup restored into a fresh browser brings back the flight and settings (#47)", async ({
  app,
  page,
  browser,
}, testInfo) => {
  await app.firstRun();
  await tickOf(page, "BATTERY switch").click();
  await expect(tickedOf(page, "BATTERY switch")).toBeVisible();
  await page.goto("./#/settings");
  const appearance = page.getByRole("radiogroup", { name: "Appearance" });
  await appearance.getByRole("radio", { name: "Light" }).click();
  await expect(page.getByText("Last backup: never")).toBeVisible();
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Save a backup file" }).click(),
  ]);
  expect(file.suggestedFilename()).toMatch(/^involo-backup-\d{4}-\d\d-\d\d\.json$/);
  const path = testInfo.outputPath("backup.json");
  await file.saveAs(path);
  await expect(page.getByText(/^Last backup: \w{3} \d+ at \d\d:\d\d$/)).toBeVisible();
  const before = (await saved(page, "involo.settings")) as Record<string, unknown>;

  // A fresh browser: nothing saved, the iFly pack downloaded as on a first launch.
  const fresh = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  await fresh.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;
    return host === "localhost" || host === "127.0.0.1" ? route.continue() : route.abort("blockedbyclient");
  });
  const other = await fresh.newPage();
  const there = new App(other);
  await there.firstRun();
  await expect(tickOf(other, "BATTERY switch")).toBeVisible();
  await other.goto("./#/settings");
  await other.locator('.set.backup input[type="file"]').setInputFiles(path);
  const dialog = other.getByRole("dialog", { name: "Restore from this backup?" });
  await expect(dialog.getByText(IFLY.name)).toBeVisible();
  await expect(dialog.getByText("No flight on this device yet, so nothing is replaced.")).toBeVisible();
  await dialog.getByRole("button", { name: "Restore" }).click();
  await there.ready();
  await other.goto("./#/");
  await expect(tickedOf(other, "BATTERY switch"), "the tick is back").toBeVisible();
  expect(await tickedIds(other, IFLY.id)).toEqual(await tickedIds(page, IFLY.id));
  const after = (await saved(other, "involo.settings")) as Record<string, unknown>;
  expect(after.theme).toBe("light");
  // The same settings, but for when this browser last saved a backup: it never has.
  expect({ ...after, lastBackup: before.lastBackup }).toEqual(before);
  expect(after.lastBackup).toBeNull();
  await fresh.close();
});
