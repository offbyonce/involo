// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Step timers (#213, Timers boards): ticking the start levers starts the engine warm-up by itself;
// its chip and the running-timers bar count down; Pause holds it and Resume runs on; Restart
// starts it again; it keeps running through a reload; and at zero it chimes once, and its row
// shows it finished until it is restarted. The page's clock is Playwright's, paused once the app is
// up, so time moves only when the test moves it: three minutes pass in a moment, every reading is
// exact however slow the machine, and the chime is counted instead of heard.

import { expect, test } from "./fixtures";
import { checkScreen } from "./layout";

test.use({ viewport: { width: 1440, height: 900 } });

test("a step timer starts from its trigger, pauses, resumes, restarts, runs through a reload and finishes with a chime", async ({
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
  // From here, time stands still between the test's own runFor calls (#281's run read 1:45 where
  // 1:46 was due, the clock having run on in real time while the check waited).
  const PAUSED_AT = new Date("2026-11-21T10:05:00Z");
  await page.clock.pauseAt(PAUSED_AT);
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
  await expect(chip).toHaveAttribute("aria-label", "Engine warm-up timer, 3 minutes left");
  const bar = page.getByRole("region", { name: "Running timers" });
  await expect(bar).toContainText("Engine warm-up 3:00");
  await expect(
    row.getByText("Timer started when you set IDLE. Carry on with other steps; a chime plays at zero."),
  ).toBeVisible();

  await page.clock.runFor(65_000);
  await expect(chip, "it counts down").toHaveText("1:55");
  // Layout and accessibility at every size, with the chip and the bar on screen at each. The check
  // waits on the page's own timers, so they run during it while the date stands still at 1:55
  // left (setFixedTime, then resume); then the clock is paused there again and the date unfixed,
  // so runFor moves it once more.
  const at = new Date(PAUSED_AT.getTime() + 65_000);
  await page.clock.setFixedTime(at);
  await page.clock.resume();
  await checkScreen(page, "A running step timer", [chip, bar]);
  await page.clock.pauseAt(at);
  await page.clock.setSystemTime(at);
  await expect(chip, "the layout check took no time off").toHaveText("1:55");

  // Pause holds it, and the bar says so; Resume runs on from there.
  await row.getByRole("button", { name: "Pause" }).click();
  await expect(chip).toHaveAttribute("aria-label", "Engine warm-up timer, paused, 1 minute 55 seconds left");
  await expect(chip).toContainText("Paused 1:55");
  await expect(row.getByText("Timer paused with 1:55 left.")).toBeVisible();
  await expect(bar).toContainText("Engine warm-up 1:55 · Paused");
  await page.clock.runFor(30_000);
  await expect(chip.locator(".time"), "held while paused").toHaveText("1:55");
  await row.getByRole("button", { name: "Resume" }).click();
  await page.clock.runFor(5_000);
  await expect(chip, "runs on from where it was").toHaveText("1:50");

  // Restart: the whole time again.
  await row.getByRole("button", { name: "Restart" }).click();
  await expect(chip).toHaveText("3:00");

  // Through a reload, it keeps running from where it was.
  await page.clock.runFor(30_000);
  await app.reload();
  await expect(chip, "still running after a reload").toHaveText("2:30");

  // At zero: one chime; the bar lets it go, and the row shows it finished, with Restart.
  expect(await chimes()).toBe(0);
  await page.clock.runFor(151_000);
  await expect(chip, "finished at zero").toHaveAttribute("aria-label", "Engine warm-up timer, finished");
  await expect(chip).toContainText("Finished");
  await expect(row.getByText("Timer finished.")).toBeVisible();
  await expect(row.getByRole("button", { name: "Pause" })).toHaveCount(0);
  await expect(bar).toHaveCount(0);
  await expect.poll(chimes, { message: "one chime at zero" }).toBe(1);
  await page.clock.runFor(10_000);
  expect(await chimes(), "and only one").toBe(1);
});
