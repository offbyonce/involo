// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import type { Page } from "@playwright/test";
import { chooseFile, exampleFile, go, restarted } from "../build/scenes.mjs";
import { type App, expect, test } from "./fixtures";
import { sortFindings } from "./known-findings";
import { screenProblems } from "./layout";

// The main screens with each pack open, the iFly pack and the invented example packs (decision
// 0030, #108), checked for layout and accessibility at phone and desktop width in both themes: a
// screen built only around one aircraft's data shows it here. A finding fails unless
// known-findings.ts lists it with the issue that fixes it, and a listed one that no longer happens
// fails too.

const ALL_PACKS = [
  { id: "ifly-737-max8", name: "iFly 737 MAX 8" },
  { id: "example-twin", name: "Example Twin" },
  { id: "example-sidestick", name: "Example Sidestick Twin" },
  { id: "example-twin-lr", name: "Example Twin LR" },
];

/**
 * The packs to check: all of them, or the ones `E2E_SCREENS_PACKS` names, comma separated (CI
 * checks fewer on a pull request and every pack on main). A name that isn't a pack here fails, so
 * a renamed pack can't drop out unseen.
 */
function chosenPacks(list: string | undefined): typeof ALL_PACKS {
  const ids = (list ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length === 0) return ALL_PACKS;
  const unknown = ids.filter((id) => !ALL_PACKS.some((p) => p.id === id));
  if (unknown.length)
    throw new Error(
      `E2E_SCREENS_PACKS names ${unknown.join(", ")}, not one of ${ALL_PACKS.map((p) => p.id).join(", ")}`,
    );
  return ALL_PACKS.filter((p) => ids.includes(p.id));
}
const PACKS = chosenPacks(process.env.E2E_SCREENS_PACKS);

/** The first launch with this pack: the iFly pack from the catalog, an example added from its
 * file (the examples are never in the catalog); the welcome answered. */
async function firstRunWith(app: App, page: Page, id: string): Promise<void> {
  if (id === "ifly-737-max8") {
    await app.firstRun();
    return;
  }
  await app.open();
  await app.answerNotice();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await app.scene([
    go("#/packs"),
    chooseFile('input[type="file"]', exampleFile(id), `${id}.involo-pack`),
    restarted,
  ]);
  await app.ready();
  await app.answerWelcome();
}

const heading = (page: Page) => page.getByRole("heading", { level: 1 }).first();

for (const pack of PACKS) {
  test(`the main screens with ${pack.name} open: layout and accessibility (#108, #198)`, async ({
    app,
    page,
  }) => {
    test.setTimeout(240_000);
    await firstRunWith(app, page, pack.id);
    const problems: { screen: string; problem: string }[] = [];
    const check = async (screen: string, keys: ReturnType<Page["locator"]>[]) => {
      for (const problem of await screenProblems(page, screen, keys)) problems.push({ screen, problem });
    };

    // A phase in List: the app opens on the pack's first phase.
    await expect(page.locator("li.it[data-step]").first()).toBeVisible();
    await check("a phase in List", [heading(page), page.locator("li.it[data-step]").first()]);

    // The same phase in Step by step.
    await page.goto("./#/settings");
    await page.getByRole("radiogroup", { name: "View" }).getByRole("radio", { name: "Step by step" }).click();
    await page.goto("./#/");
    await expect(page.locator(".box h1")).toBeVisible();
    await check("a phase in Step by step", [page.locator(".box h1")]);
    await page.goto("./#/settings");
    await page.getByRole("radiogroup", { name: "View" }).getByRole("radio", { name: "List" }).click();

    for (const [hash, screen] of [
      ["#/flight/start", "Start"],
      ["#/setup", "Flight"],
      ["#/reference", "Emergency"],
      ["#/references", "References"],
      ["#/how", "How"],
      ["#/practice", "Practice"],
      ["#/deck", "Flight deck"],
    ] as const) {
      await page.goto(`./${hash}`);
      await expect(heading(page)).toBeVisible();
      await check(screen, [heading(page)]);
    }

    // Find, open over a phase.
    await page.goto("./#/");
    await expect(page.locator("li.it[data-step]").first()).toBeVisible();
    await page.keyboard.press("Control+K");
    const find = page.getByRole("combobox", { name: "Find a step, control or term" });
    await expect(find).toBeVisible();
    await find.fill((await page.locator("li.it[data-step] .nm").first().textContent())?.trim() ?? "");
    await expect(page.locator("#find-steps [role=option]").first()).toBeVisible();
    await check("Find", [find]);

    const { fresh, gone } = sortFindings(pack.name, problems);
    expect(fresh, `${pack.name}: layout and accessibility findings not in known-findings.ts`).toEqual([]);
    expect(
      gone,
      `${pack.name}: known findings that no longer happen (remove them from known-findings.ts)`,
    ).toEqual([]);
  });
}
