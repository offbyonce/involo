// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Step timers (#213, Timer board, drawn at 1440): ticking the start levers starts the engine
// warm-up by itself; its chip and the running-timers bar count down; Restart starts it again;
// it keeps running through a reload; and at zero it chimes and leaves the row. The page's clock is
// Playwright's, so three minutes pass in a moment, and the chime is counted instead of heard.

import { expect, test } from "./fixtures";
import { checkScreen } from "./layout";

test.use({ viewport: { width: 1440, height: 900 } });

test("a step timer starts from its trigger, runs through a reload, restarts and chimes at zero", async ({
  app,
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-21T10:00:00Z") });
  await page.addInitScript(() => {
    const w = window as unknown as { chimes: number; AudioContext: unknown };
    w.chimes = 0;
    // Counts chimes: each makes one context.
    w.AudioContext = class {
      currentTime = 0;
      destination = {};
      constructor() {
        w.chimes += 1;
      }
      createOscillator() {
        return { frequency: {}, connect() {}, start() {}, stop() {} };
      }
      createGain() {
        return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
      }
      close() {
        return Promise.resolve();
      }
    };
  });
  await app.firstRun();
  const chimes = () => page.evaluate(() => (window as unknown as { chimes: number }).chimes);

  // Engine start: the warm-up starts from the later of the two start lever ticks.
  await app.open("#/phase/engine-start");
  await app.ready();
  for (const n of [1, 2]) {
    await page.getByRole("button", { name: new RegExp(`^Confirm Engine ${n} start lever`, "i") }).click();
  }
  await app.open("#/phase/takeoff");
  await app.ready();
  const row = page.locator('li[data-step="ifly-737-max8.takeoff.engine-warm-up"]');
  const chip = row.getByRole("timer");
  await expect(chip, "the warm-up runs on its step").toHaveText("3:00");
  await expect(chip).toHaveAttribute("aria-label", "Engine warm-up, 3 minutes left");
  const bar = page.getByRole("region", { name: "Running timers" });
  await expect(bar).toContainText("Engine warm-up 3:00");
  await expect(row.getByText(/^Engine warm-up timer started by itself when you ticked /)).toBeVisible();

  await page.clock.runFor(65_000);
  await expect(chip, "it counts down").toHaveText("1:55");
  // Layout and accessibility at every size. The chip and the bar show from 1440 px until the
  // tablet and phone boards come, so they aren't keys here yet.
  await checkScreen(page, "A running step timer");

  // Restart: the whole time again.
  await row.getByRole("button", { name: "Restart" }).click();
  await expect(chip).toHaveText("3:00");

  // Through a reload, it keeps running from where it was.
  await page.clock.runFor(30_000);
  await app.reload();
  await expect(chip, "still running after a reload").toHaveText("2:30");

  // At zero: a chime, and the row and the bar let it go.
  expect(await chimes()).toBe(0);
  await page.clock.runFor(151_000);
  await expect(chip, "gone at zero").toHaveCount(0);
  await expect(bar).toHaveCount(0);
  await expect.poll(chimes, { message: "one chime at zero" }).toBe(1);
});
