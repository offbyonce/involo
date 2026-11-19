// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { LOG_OPEN, seedLog } from "../build/scenes.mjs";
import { expect, test } from "./fixtures";
import { checkScreen } from "./layout";

test("the flight log names a skipped step its pack no longer has as the checklist would", async ({
  app,
  page,
}) => {
  await app.firstRun();
  // A log saved by an earlier version (format 1), with a flight whose skipped steps include
  // "CREW OXYGEN", a step this pack no longer has.
  await app.scene(seedLog);
  await app.ready();
  await page.goto("./#/log");
  await checkScreen(page, "Flight log", [page.getByRole("heading", { name: "Flight log" })]);
  await page.goto(`./#/log/${encodeURIComponent(LOG_OPEN)}`);
  const entry = page.getByRole("main");
  await expect(entry.getByText("Skipped · 2"), "the flight's skipped steps are listed").toBeVisible();
  await expect(
    entry.getByText("Crew oxygen", { exact: true }),
    "named in sentence case, as the checklist names steps",
  ).toBeVisible();
  await expect(entry.getByText("CREW OXYGEN", { exact: true }), "never in the pack's capitals").toHaveCount(
    0,
  );
  await checkScreen(page, "Flight log, an earlier flight", [entry.getByText("Crew oxygen", { exact: true })]);
});
