// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { addExample, go } from "../build/scenes.mjs";
import { expect, test } from "./fixtures";

// Crew roles (#133, Roles boards): in a challenge-and-response list, every row's step name and
// value start at the same place, whatever its state and whichever tags it has, at each size.
// The example pack's Before start is that list; its first step done, its second is current.

const SIZES = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet portrait", width: 820, height: 1180 },
  { name: "tablet landscape", width: 1180, height: 820 },
  { name: "desktop", width: 1440, height: 900 },
];

/** Where each shown row's name, value and tags start, by row state. */
const starts = () =>
  [...document.querySelectorAll<HTMLElement>("li.it.pair")]
    .filter((li) => li.offsetParent !== null)
    .map((li) => {
      const left = (selector: string) => {
        const el = li.querySelector<HTMLElement>(selector);
        return el ? Math.round(el.getBoundingClientRect().left) : null;
      };
      return {
        state: ["done", "current", "to_do", "skipped"].find((s) => li.classList.contains(s)) ?? "?",
        name: left(".nm"),
        value: left(".value .val"),
        calls: left(".calls abbr"),
        answers: left(".answers abbr"),
      };
    });

test("crew roles: names, values and tags line up in every row of a challenge-and-response list (#133)", async ({
  app,
  page,
}) => {
  await app.firstRun();
  await app.scene(addExample);
  await app.ready();
  await app.scene(go("#/phase/before-start"));
  await page.locator('[data-step="example-trainer.before-start.battery"] .tick').click();
  await expect(page.locator("li.it.pair.current")).toBeVisible();
  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.waitForTimeout(300);
    const rows = await page.evaluate(starts);
    expect(
      rows.map((r) => r.state),
      size.name,
    ).toEqual(expect.arrayContaining(["done", "current"]));
    for (const key of ["name", "value", "calls", "answers"] as const) {
      const at = new Set(rows.map((r) => r[key]));
      expect(at.size, `${size.name}: every row's ${key} starts at one place (${JSON.stringify(rows)})`).toBe(
        1,
      );
    }
  }
});
