// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { expect, IFLY, test } from "./fixtures";
import { checkScreen } from "./layout";

test("first run: choose a pack from the catalog and land on its checklist", async ({ app, page }) => {
  await app.open();
  await expect(page.getByRole("heading", { name: "Choose your first aircraft" })).toBeVisible();
  await checkScreen(page, "First launch", [page.getByRole("button", { name: `Download ${IFLY.name}` })]);
  await page.getByRole("button", { name: `Download ${IFLY.name}` }).click();
  await app.ready();
  await app.answerWelcome();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await checkScreen(page, "Checklist", [
    page.getByRole("heading", { level: 1 }),
    page.getByRole("button", { name: /^BATTERY switch ,/ }),
  ]);
  // The pack is kept: a reload starts on it, not on the first launch.
  await app.reload();
  await expect(page.getByRole("heading", { name: "Choose your first aircraft" })).toBeHidden();
});
