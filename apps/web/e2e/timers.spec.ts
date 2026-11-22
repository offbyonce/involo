// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Step timers (#213, Timers boards): ticking the start levers starts the engine warm-up by itself;
// its chip and the running-timers bar count down; Pause holds it and Resume runs on; Restart
// starts it again; it keeps running through a reload; and at zero it chimes once, and its row
// shows it finished until it is restarted. The page's clock is Playwright's, so three minutes pass
// in a moment, and the chime is counted instead of heard.

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
  // Layout and accessibility at every size, with the chip and the bar on screen at each.
  await checkScreen(page, "A running step timer", [chip, bar]);

  // Pause holds it, and the bar says so; Resume runs on from there. (The layout check takes real
  // time, so the time paused is read from the chip.)
  await row.getByRole("button", { name: "Pause" }).click();
  await expect(chip).toHaveAttribute(
    "aria-label",
    /^Engine warm-up timer, paused, 1 minute \d+ seconds? left$/,
  );
  const held = (await chip.locator(".time").textContent())?.trim() ?? "";
  expect(held).toMatch(/^1:\d\d$/);
  await expect(chip).toContainText(`Paused ${held}`);
  await expect(row.getByText(`Timer paused with ${held} left.`)).toBeVisible();
  await expect(bar).toContainText(`Engine warm-up ${held} · Paused`);
  await page.clock.runFor(30_000);
  await expect(chip.locator(".time"), "held while paused").toHaveText(held);
  await row.getByRole("button", { name: "Resume" }).click();
  await page.clock.runFor(5_000);
  const [m, sec] = held.split(":").map(Number) as [number, number];
  const on = m * 60 + sec - 5;
  await expect(chip, "runs on from where it was").toHaveText(
    `${Math.floor(on / 60)}:${String(on % 60).padStart(2, "0")}`,
  );

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
