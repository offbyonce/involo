// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { expect, IFLY, test } from "./fixtures";
import { checkScreen } from "./layout";

test("first run: choose a pack from the catalog and land on its checklist", async ({ app, page }) => {
  await app.open();
  await app.answerNotice();
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

test("the simulator-only notice comes first, closes only with I understand and never comes back (#241)", async ({
  app,
  page,
}) => {
  await app.open();
  const notice = page.getByRole("dialog", { name: "Simulator training only" });
  await expect(notice).toBeVisible();
  const understood = notice.getByRole("button", { name: "I understand" });
  await expect(understood, "focus starts on I understand").toBeFocused();
  await checkScreen(page, "Simulator-only notice", [understood]);
  // No Esc, no scrim click: the first launch underneath stays out of reach.
  await page.keyboard.press("Escape");
  await page.mouse.click(5, 5);
  await expect(notice).toBeVisible();
  await expect
    .poll(
      () =>
        page.getByRole("button", { name: `Download ${IFLY.name}` }).evaluate((b) => !!b.closest("[inert]")),
      { message: "the page underneath is inert" },
    )
    .toBe(true);
  await understood.click();
  await expect(notice).toBeHidden();
  await expect(page.getByRole("heading", { name: "Choose your first aircraft" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Choose your first aircraft" })).toBeVisible();
  await expect(notice).toBeHidden();
});
