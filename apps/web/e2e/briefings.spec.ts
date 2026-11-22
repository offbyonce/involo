// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Briefings (#214, Briefings boards): the takeoff briefing sits at the top of Before start, above
// the procedure, which keeps its own Done; Briefed folds it to one line with the time, which stays
// through a reload; Show opens it to read and Mark not briefed puts it back to give. Skip briefing
// leaves it open: "1 open step" lists it under its phase, and Brief it now gives it.

import { readFileSync } from "node:fs";
import { expect, saved, test } from "./fixtures";
import { checkScreen } from "./layout";

test.use({ viewport: { width: 1440, height: 900 } });

test("a briefing is given, kept through a reload, put back, skipped as an open item and given again", async ({
  app,
  page,
}) => {
  await app.firstRun();
  await app.open("#/phase/before-start");
  await app.ready();

  const card = page.getByRole("region", { name: "Takeoff briefing items (gate/stand)" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Briefing · 4 lines");
  await expect(card.locator(".word").first()).toHaveText("ATIS/WEATHER");
  // It never blocks the steps: the current step keeps its own Done.
  await expect(page.locator(".it.current").getByRole("button", { name: "Done", exact: true })).toBeVisible();
  await checkScreen(page, "A briefing to give", [card]);

  await card.getByRole("button", { name: "Briefed", exact: true }).click();
  const line = page.locator(".briefed-row");
  await expect(line).toContainText(/briefed at/i);
  await expect(card).toHaveCount(0);
  await checkScreen(page, "A briefing given", [line]);

  // Saved with the flight: still briefed after a reload.
  await app.reload();
  await expect(page.locator(".briefed-row"), "still briefed after a reload").toContainText(
    "Takeoff briefing items (gate/stand)",
  );

  // Show opens it to read; Mark not briefed puts it back to give.
  await page.getByRole("button", { name: /^Show the Takeoff briefing/ }).click();
  await expect(card).toContainText(/briefed at/i);
  await card.getByRole("button", { name: "Mark not briefed" }).click();
  await expect(card.getByRole("button", { name: "Briefed", exact: true })).toBeVisible();

  // Skipped, it is open, like a skipped step, and listed under its phase.
  await card.getByRole("button", { name: "Skip briefing" }).click();
  const skipped = page.locator(".skipped-row");
  await expect(skipped).toContainText("Skipped");
  await checkScreen(page, "A briefing skipped", [skipped]);
  await page.getByRole("button", { name: "1 open step" }).click();
  const pop = page.getByRole("dialog", { name: "1 open step" });
  await expect(pop).toContainText("Before start · Briefing");
  await expect(pop).toContainText("Takeoff briefing items (gate/stand)");
  await page.keyboard.press("Escape");

  await skipped.getByRole("button", { name: "Brief it now" }).click();
  await card.getByRole("button", { name: "Briefed", exact: true }).click();
  await expect(page.locator(".briefed-row")).toContainText(/briefed at/i);
  await expect(page.getByRole("button", { name: /open step/ })).toHaveCount(0);
});

test("a flight saved before briefings (format 6) loads, keeps its paused timer and saves a briefing at today's format", async ({
  app,
  page,
}) => {
  await app.firstRun();
  // The frozen format-6 flight the Rust tests read: the IRS timer paused with 4:31 left.
  const old = readFileSync(
    new URL("../../../crates/involo-app-core/tests/fixtures/flight-format-6.json", import.meta.url),
    "utf8",
  );
  await page.evaluate((text) => localStorage.setItem("involo.flight.ifly-737-max8", text), old);
  await app.reload();
  await app.open("#/phase/preflight");
  await app.ready();
  await expect(
    page.locator('li[data-step="ifly-737-max8.preflight.irs"]').getByRole("timer"),
  ).toHaveAttribute("aria-label", "IRS alignment timer, paused, 4 minutes 31 seconds left");
  // Nothing briefed yet: the takeoff briefing is to give.
  await app.open("#/phase/before-start");
  const card = page.getByRole("region", { name: "Takeoff briefing items (gate/stand)" });
  await expect(card).toContainText("Briefing · 4 lines");
  await checkScreen(page, "A briefing, on a flight from format 6", [card]);
  await card.getByRole("button", { name: "Briefed", exact: true }).click();
  await expect(page.locator(".briefed-row")).toContainText(/briefed at/i);
  const flight = (await saved(page, "involo.flight.ifly-737-max8")) as {
    format: number;
    briefings?: Record<string, { state: string }>;
    timerPauses?: Record<string, number>;
  };
  expect(flight.format, "saved at today's format").toBe(8);
  expect(flight.briefings?.["takeoff-briefing-items-gate-stand"]?.state).toBe("briefed");
  expect(flight.timerPauses?.["ifly-737-max8.preflight.irs"]).toBe(271000);
});
