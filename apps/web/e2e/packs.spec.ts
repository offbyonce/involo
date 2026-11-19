// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import {
  addExample,
  chooseFile,
  olderIflyWithChanges,
  openWhatsNew,
  updateFromWhatsNew,
} from "../build/scenes.mjs";
import { expect, IFLY, test, tickedIds, tickedOf, tickOf } from "./fixtures";
import { checkScreen } from "./layout";

const EXAMPLE = { id: "example-trainer", name: "Example trainer (format demo)" };

test("switching packs and back: each pack keeps its own flight (#104)", async ({ app, page }) => {
  await app.firstRun();
  await tickOf(page, "BATTERY switch").click();
  await expect(tickedOf(page, "BATTERY switch")).toBeVisible();
  // Adding the example pack from a file opens it, with a flight of its own.
  await app.scene(addExample);
  await app.ready();
  expect(await tickedIds(page, EXAMPLE.id), "the new pack starts with no ticks").toEqual([]);
  const first = page.getByRole("button", { name: /^Confirm / }).first();
  const firstName = ((await first.getAttribute("aria-label")) ?? "").replace(/^Confirm (.*?):.*$/, "$1");
  await first.click();
  await expect
    .poll(() => tickedIds(page, EXAMPLE.id), { message: "the example pack's tick is saved under it" })
    .toHaveLength(1);
  // Back to iFly from the Packs page: its tick is as it was left.
  await page.goto("./#/packs");
  await checkScreen(page, "Packs", [
    page.getByRole("article", { name: IFLY.name }),
    page.getByRole("article", { name: EXAMPLE.name }),
  ]);
  await page.getByRole("article", { name: IFLY.name }).getByRole("button", { name: "Use this pack" }).click();
  await app.ready();
  await expect(tickedOf(page, "BATTERY switch"), "iFly's tick is kept through the switch").toBeVisible();
  expect(await tickedIds(page, IFLY.id)).toEqual([`${IFLY.id}.cold-dark.battery-switch`]);
  // And the example pack's tick is still its own.
  await page.goto("./#/packs");
  await page
    .getByRole("article", { name: EXAMPLE.name })
    .getByRole("button", { name: "Use this pack" })
    .click();
  await app.ready();
  await expect(tickedOf(page, firstName), "the example pack's tick is kept too").toBeVisible();
});

test("updating a pack lists the changed steps and keeps the ticks (#105)", async ({ app, page }) => {
  await app.firstRun();
  await tickOf(page, "BATTERY switch").click();
  await expect(tickedOf(page, "BATTERY switch")).toBeVisible();
  // The installed iFly becomes an older version with an extra step (ticked), a reworded value and
  // a missing step; What's new lists what the catalog's version changes.
  await app.scene(olderIflyWithChanges);
  await app.scene(openWhatsNew);
  const whatsNew = page.getByRole("dialog", { name: /^What’s new in iFly 737 MAX 8/ });
  await expect(whatsNew).toBeVisible();
  await expect(whatsNew.getByText("Alternate flaps master switch"), "the added step is listed").toBeVisible();
  await expect(whatsNew.getByText("Window heat test"), "the removed step is listed").toBeVisible();
  await checkScreen(page, "What's new", [whatsNew.getByRole("button", { name: "Update" })]);
  await app.scene(updateFromWhatsNew);
  const note = page.getByRole("region", { name: "Pack updated" });
  await expect(note, "the update note shows on the checklist").toBeVisible();
  await expect(note).toContainText("Your ticks are kept on every step that’s still there");
  await expect(
    note.getByText("You had ticked this step; the tick is gone with it."),
    "the lost tick is named",
  ).toBeVisible();
  await checkScreen(page, "Update note", [note]);
  await expect(tickedOf(page, "BATTERY switch"), "a tick on a step that stays is kept").toBeVisible();
  expect(await tickedIds(page, IFLY.id)).toContain(`${IFLY.id}.cold-dark.battery-switch`);
});

test("a pack file is added, and a broken one is refused with its reason", async ({ app, page }) => {
  await app.firstRun();
  await page.goto("./#/packs");
  await app.scene(chooseFile('input[type="file"]', "this is not a pack", "broken.involo-pack"));
  await expect(page.getByText(/wasn’t added\./), "the refusal says the file wasn't added").toBeVisible();
  await checkScreen(page, "Packs, a file refused", [page.getByText(/wasn’t added\./)]);
  await expect(page.getByRole("article", { name: EXAMPLE.name }), "nothing was installed").toHaveCount(0);
  await app.scene(addExample);
  await app.ready();
  await page.goto("./#/packs");
  const card = page.getByRole("article", { name: EXAMPLE.name });
  await expect(card, "the pack from the file is installed").toBeVisible();
  await expect(
    card.getByText("Not from the Involo catalog"),
    "and marked as not from the catalog",
  ).toBeVisible();
});
