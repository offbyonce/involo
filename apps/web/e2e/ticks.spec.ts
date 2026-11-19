// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { expect, IFLY, test, tickedIds, tickedOf, tickOf } from "./fixtures";
import { checkScreen } from "./layout";

test("ticks are saved and still there after a reload", async ({ app, page }) => {
  await app.firstRun();
  await tickOf(page, "BATTERY switch").click();
  await expect(tickedOf(page, "BATTERY switch"), "the tick shows on its row").toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await checkScreen(page, "Checklist with a tick", [tickedOf(page, "BATTERY switch")]);
  await expect
    .poll(() => tickedIds(page, IFLY.id), { message: "the tick is saved on this device" })
    .toContain(`${IFLY.id}.cold-dark.battery-switch`);
  await app.reload();
  await expect(tickedOf(page, "BATTERY switch"), "the tick is still there after a reload").toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(tickOf(page, "STANDBY POWER switch"), "an untouched step stays unticked").toBeVisible();
});
