// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import {
  EXAMPLE_PACK_NAME,
  LOG_OPEN,
  seedLog,
  seedLogByPack,
  seedLogByPackFormat2,
} from "../build/scenes.mjs";
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

test("the flight log shows one pack's flights and results, and exports only them (#107)", async ({
  app,
  page,
}) => {
  await app.firstRun();
  // Today's log format: the board's iFly flights and results, and two flights and a result from
  // the example pack, each with its pack's name and version.
  await app.scene(seedLogByPack);
  await app.ready();
  await page.goto("./#/log");
  const chips = page.getByRole("group", { name: "Show flights from" });
  const all = chips.getByRole("button", { name: "All packs 9" });
  const example = chips.getByRole("button", { name: `${EXAMPLE_PACK_NAME} 3` });
  await expect(all, "every pack, chosen to start with").toHaveAttribute("aria-pressed", "true");
  await expect(chips.getByRole("button", { name: "iFly 737 MAX 8 6" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Earlier flights · 5" })).toBeVisible();
  await expect(
    page.getByText(`${EXAMPLE_PACK_NAME} · 0.1.0 · 21 min · 13 of 13 steps`),
    "each flight names the pack and version it was flown with",
  ).toBeVisible();
  await checkScreen(page, "Flight log, every pack", [all]);

  await example.click();
  await expect(example).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Earlier flights · 2" })).toBeVisible();
  await expect(
    page.getByText("0.1.0 · 21 min · 13 of 13 steps"),
    "under a pack's chip, the version alone",
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /^This flight/ }),
    "This flight is the iFly pack's",
  ).toHaveCount(0);
  await expect(page.getByText(`Exports hold ${EXAMPLE_PACK_NAME} only.`, { exact: false })).toBeVisible();
  await checkScreen(page, "Flight log, one pack", [example]);

  // The file the pilot is handed, as the page makes it.
  await page.evaluate(() => {
    const make = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (file: Blob | MediaSource) => {
      void (file as Blob).text().then((t) => document.body.setAttribute("data-exported", t));
      return make(file);
    };
  });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  await download;
  await expect(page.locator("body[data-exported]")).toHaveCount(1);
  const saved = JSON.parse((await page.locator("body").getAttribute("data-exported")) ?? "");
  expect(saved.format, "the export is a log file of today's format").toBe(3);
  expect(
    [...saved.flights, ...saved.practice].every((e: { pack: string }) => e.pack === "example-trainer"),
    "the export holds only the chosen pack's flights and results",
  ).toBe(true);
  expect([saved.flights.length, saved.practice.length]).toEqual([2, 1]);

  await all.click();
  await expect(page.getByRole("heading", { name: /^This flight/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Earlier flights · 5" })).toBeVisible();
});

test("a log saved by the version before (format 2) loads, migrates and filters by pack (#107)", async ({
  app,
  page,
}) => {
  await app.firstRun();
  // Log format 2: each flight's pack name saved as `aircraft`, no stage ids, practice results
  // with only their pack's id.
  await app.scene(seedLogByPackFormat2);
  await app.ready();
  await page.goto("./#/log");
  const chips = page.getByRole("group", { name: "Show flights from" });
  await expect(chips.getByRole("button", { name: "All packs 9" }), "every entry kept").toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // The pack's name comes from the flights' old `aircraft`; the practice results, which never
  // recorded a name, are counted under their pack.
  const example = chips.getByRole("button", { name: `${EXAMPLE_PACK_NAME} 3` });
  await expect(chips.getByRole("button", { name: "iFly 737 MAX 8 6" })).toBeVisible();
  await expect(page.getByText(`${EXAMPLE_PACK_NAME} · 0.1.0 · 21 min · 13 of 13 steps`)).toBeVisible();
  await checkScreen(page, "Flight log, migrated from format 2", [example]);

  await example.click();
  await expect(page.getByRole("heading", { name: "Earlier flights · 2" })).toBeVisible();
  const results = page.locator(".result");
  await expect(results, "only the example pack's practice result").toHaveCount(1);
  // Saved before format 3, it recorded no version: none is shown, and none is guessed.
  await expect(results.first()).toHaveText(/^\s*\S+ \d+ \w+\s*Memory items\s*3 of 4\s*$/);

  // What the export holds is today's format, with only the chosen pack's entries, the old
  // `aircraft` moved to `packName` and what format 2 never recorded left unknown.
  await page.evaluate(() => {
    const make = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (file: Blob | MediaSource) => {
      void (file as Blob).text().then((t) => document.body.setAttribute("data-exported", t));
      return make(file);
    };
  });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  await download;
  await expect(page.locator("body[data-exported]")).toHaveCount(1);
  const saved = JSON.parse((await page.locator("body").getAttribute("data-exported")) ?? "");
  expect(saved.format).toBe(3);
  expect(saved.flights.map((f: { packName: string; aircraft: unknown }) => [f.packName, f.aircraft])).toEqual(
    [
      [EXAMPLE_PACK_NAME, null],
      [EXAMPLE_PACK_NAME, null],
    ],
  );
  expect(saved.flights[0].stages.every((st: { id: unknown }) => st.id === null)).toBe(true);
  expect(saved.practice).toMatchObject([
    { pack: "example-trainer", packVersion: null, packName: null, aircraft: null },
  ]);
});
