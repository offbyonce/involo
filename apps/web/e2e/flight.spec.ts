// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { dropOfp } from "../build/scenes.mjs";
import { expect, IFLY, saved, test } from "./fixtures";
import { checkScreen } from "./layout";

test("a SimBrief plan from a file fills the flight and is kept", async ({ app, page }) => {
  await app.firstRun();
  await page.goto("./#/flight/simbrief");
  await checkScreen(page, "SimBrief and OFP file", [
    page.getByRole("heading", { name: "SimBrief and OFP file" }),
  ]);
  await app.scene(dropOfp);
  await expect(
    page.getByText(/^Imported KSEA → KSFO: \d+ values\./),
    "the import says what it filled",
  ).toBeVisible();
  await expect
    .poll(() => saved(page, `involo.plan.${IFLY.id}`), { message: "the plan is kept on this device" })
    .not.toBeNull();
  await page.goto("./#/flight/route");
  await expect(page.getByText("KSEA").first(), "the route shows the plan's airports").toBeVisible();
  await checkScreen(page, "Route", [page.getByText("KSEA").first()]);
});

test("notes and values typed in the flight survive a reload", async ({ app, page }) => {
  await app.firstRun();
  await page.goto("./#/flight/clearance");
  await page.getByLabel("Runway").fill("16l");
  await page.getByLabel("Runway").blur();
  const notes = page.locator('[data-row="notes"] input');
  await notes.fill("Expect FL370 ten minutes after departure");
  await notes.blur();
  await expect(page.getByLabel("Runway")).toHaveValue("16L");
  await checkScreen(page, "Clearance", [page.getByLabel("Runway")]);
  await app.reload();
  await expect(page.getByLabel("Runway"), "the runway is kept").toHaveValue("16L");
  await expect(page.locator('[data-row="notes"] input'), "the note is kept").toHaveValue(
    "Expect FL370 ten minutes after departure",
  );
});
