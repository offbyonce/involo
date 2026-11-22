// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The exterior inspection's top view (#216, walkaround boards): with the inspection on (the Start
// page's switch, on by default), each stop's pane has Look for, its location line and the top view
// of the airplane with every stop numbered. The view follows the list as stops are ticked, skipped
// and gone back to, and keeps it through a reload. On a phone it is in the current step's card.

import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { checkScreen } from "./layout";

const STOP = (id: string) => `li[data-step="ifly-737-max8.exterior.${id}"]`;

async function tick(page: Page, id: string): Promise<void> {
  await page.locator(STOP(id)).locator("button.tick").click();
}

test.describe("on desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the top view follows the stops as they're ticked, skipped and gone back to, through a reload", async ({
    app,
    page,
  }) => {
    await app.firstRun();
    await app.open("#/flight/start");
    await app.ready();
    await expect(page.getByRole("switch", { name: /Exterior inspection/ })).toBeChecked();
    await app.open("#/phase/exterior");
    await app.ready();

    const pane = page.getByRole("complementary", { name: "About the step" });
    const view = pane.getByRole("img", { name: /^Top view of the airplane/ });
    await expect(pane).toContainText("The walkaround · stop 1 of 18");
    await expect(view).toHaveAttribute(
      "aria-label",
      "Top view of the airplane with 18 numbered stops. Stop 1, Left forward fuselage, is current.",
    );
    await expect(pane.locator(".lookcard")).toContainText(
      "Temperature sensor, pitot tubes and angle of attack sensor",
    );
    await expect(pane).toContainText("Left side, just aft of the nose near the forward entry door.");
    await expect(pane.getByRole("button", { name: /Where is this\?/ })).toHaveCount(0);
    await checkScreen(page, "The first stop of the exterior inspection", [
      page.getByRole("img", { name: /^Top view/ }),
    ]);

    // Stops 1, 2 and 4 done and 3 skipped: stop 5 is next.
    await tick(page, "left-forward-fuselage");
    await tick(page, "nose");
    await page.locator("li.it.current").getByRole("button", { name: "Skip for now" }).click();
    await tick(page, "right-wing-root");
    await expect(pane).toContainText("The walkaround · stop 5 of 18");
    await expect(view).toHaveAttribute(
      "aria-label",
      "Top view of the airplane with 18 numbered stops. Stop 5, Engine 2, is current. 3 done, 1 skipped.",
    );
    await expect(view.locator(".mark.skipped")).toHaveCount(1);
    await checkScreen(page, "Stop 5 with one skipped", [page.getByRole("img", { name: /^Top view/ })]);

    // Going back to the skipped stop moves the view there.
    await page.locator(STOP("right-forward-fuselage")).getByRole("button", { name: "Do it now" }).click();
    await expect(pane).toContainText("The walkaround · stop 3 of 18");
    await expect(view).toHaveAttribute(
      "aria-label",
      /Stop 3, Right forward fuselage, is current\. 3 done\.$/,
    );

    // Kept through a reload.
    await app.reload();
    await expect(page.locator(STOP("right-forward-fuselage")), "still skipped").toHaveClass(/skipped/);
    await page.locator(STOP("engine-2")).locator("button.row").click();
    await expect(pane.getByRole("img", { name: /^Top view/ })).toHaveAttribute(
      "aria-label",
      /Stop 5, Engine 2, is current\. 3 done, 1 skipped\.$/,
    );
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the current stop's card has Look for, the top view and its location line", async ({ app, page }) => {
    await app.firstRun();
    await app.open("#/phase/exterior");
    await app.ready();
    const card = page.locator("li.it.current");
    await expect(card.locator(".lookcard")).toContainText("Temperature sensor");
    // Look for shows once, as the card's card, not also as the row's line.
    await expect(card.locator(".look")).toBeHidden();
    await expect(card.getByRole("img", { name: /^Top view/ })).toBeVisible();
    await expect(card.locator(".here-line")).toHaveText(
      "Left side, just aft of the nose near the forward entry door.",
    );
    await checkScreen(page, "The first stop on a phone", [page.getByRole("img", { name: /^Top view/ })]);
  });
});
