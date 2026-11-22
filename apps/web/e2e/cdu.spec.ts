// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// CDU walkthroughs (#215, CduWalk boards): the CDU step, once current, opens its walkthrough in the
// slide-out; with no flight each page reads what to type, and Add your flight opens the flight
// strip. The page is saved with the flight, so the step says where it stopped, through a reload;
// Done on the last page ticks the step and closes. A flight saved before walkthrough pages (format
// 7) loads with its values filled in and saves a page at today's format.

import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { dropOfp } from "../build/scenes.mjs";
import { expect, saved, test } from "./fixtures";
import { checkScreen } from "./layout";

test.use({ viewport: { width: 1440, height: 900 } });

const CDU = 'li[data-step="ifly-737-max8.preflight.cdu"]';

/** Ticks every step before the CDU step on Preliminary preflight, so it is current. */
async function cduCurrent(page: Page): Promise<void> {
  for (let i = 0; i < 60; i++) {
    const ticked = await page.evaluate((cdu) => {
      const rows = [...document.querySelectorAll(".it")];
      const at = rows.findIndex((r) => r.matches(cdu));
      const b = rows
        .slice(0, at)
        .map((r) => r.querySelector<HTMLButtonElement>("button.tick"))
        .find((t) => t && t.getAttribute("aria-pressed") !== "true");
      b?.click();
      return !!b;
    }, CDU);
    if (!ticked) break;
    await page.waitForTimeout(60);
  }
  await expect(page.locator(`${CDU}.current`)).toBeVisible();
}

test("a CDU walkthrough opens from its step, keeps its page through a reload and ticks the step when done", async ({
  app,
  page,
}) => {
  await app.firstRun();
  await app.open("#/phase/preflight");
  await app.ready();
  await cduCurrent(page);

  const step = page.locator(CDU);
  await expect(step).toContainText("15 pages, IDENT to TAKEOFF REF.");
  await step.getByRole("button", { name: "Open CDU walkthrough" }).click();
  const walk = page.getByRole("dialog", { name: "CDU walkthrough" });
  await expect(walk).toContainText("IDENT · page 1 of 15");
  await expect(walk).toContainText("No flight added: each page says what to type instead of your values.");
  await expect(walk.getByRole("button", { name: "Back" })).toHaveCount(0);

  // Page 2: the departure airport, unknown, reads what to type instead.
  await walk.getByRole("button", { name: "Next" }).click();
  await expect(walk).toContainText("POS INIT · page 2 of 15");
  await expect(walk).toContainText("Type the departure airport ICAO code and press 2L (REF AIRPORT).");
  await expect(walk.getByRole("img").first()).toHaveAttribute(
    "aria-label",
    /^Schematic CDU on the POS INIT page\..*Highlighted: 2L\.$/,
  );
  await checkScreen(page, "A CDU walkthrough with no flight", [walk]);

  // The arrow keys change pages too; Esc closes and the step says where it stopped.
  await page.keyboard.press("ArrowRight");
  await expect(walk).toContainText("page 3 of 15");
  await page.keyboard.press("Escape");
  await expect(walk).toHaveCount(0);
  await expect(step.getByRole("button", { name: "Continue CDU walkthrough" })).toBeFocused();
  await expect(step).toContainText("Stopped at page 3 of 15, POS INIT.");
  await checkScreen(page, "A CDU step stopped part way", [
    step.getByRole("button", { name: "Continue CDU walkthrough" }),
  ]);

  // Saved with the flight: still stopped there after a reload, and Continue opens that page.
  await app.reload();
  await expect(page.locator(CDU), "still stopped after a reload").toContainText("Stopped at page 3 of 15");
  await page.getByRole("button", { name: "Continue CDU walkthrough" }).click();
  await expect(walk).toContainText("page 3 of 15");

  // Add your flight: the flight strip's own action, with the walkthrough closed.
  await walk.getByRole("button", { name: "Add your flight" }).click();
  await expect(walk).toHaveCount(0);
  await expect(page.locator("#spop")).toBeVisible();
  await page.keyboard.press("Escape");

  // On to the last page: Done ticks the step and closes.
  await page.getByRole("button", { name: "Continue CDU walkthrough" }).click();
  for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowRight");
  await expect(walk).toContainText("TAKEOFF REF · page 15 of 15");
  await expect(walk).toContainText("Ticks the CDU step and closes.");
  await checkScreen(page, "The last page of a CDU walkthrough", [walk]);
  await walk.getByRole("button", { name: "Done" }).click();
  await expect(walk).toHaveCount(0);
  await expect(page.locator(`${CDU}.done`)).toBeVisible();
  const flight = (await saved(page, "involo.flight.ifly-737-max8")) as {
    walkthroughs?: Record<string, number>;
    session: { done: Record<string, number> };
  };
  expect(flight.walkthroughs?.["preflight-setup"], "Done starts it over").toBeUndefined();
  expect(flight.session.done["ifly-737-max8.preflight.cdu"]).toBeGreaterThan(0);
});

test("a flight saved before walkthrough pages (format 7) loads with its values in the walkthrough and saves a page at today's format", async ({
  app,
  page,
}) => {
  await app.firstRun();
  // The frozen format-7 flight the Rust tests read: KSEA to KSFO, the SUMMA2 departure.
  const old = readFileSync(
    new URL("../../../crates/involo-app-core/tests/fixtures/flight-format-7.json", import.meta.url),
    "utf8",
  );
  await page.evaluate((text) => localStorage.setItem("involo.flight.ifly-737-max8", text), old);
  await app.reload();
  await app.open("#/phase/preflight");
  await app.ready();
  await cduCurrent(page);
  await page.locator(CDU).getByRole("button", { name: "Open CDU walkthrough" }).click();
  const walk = page.getByRole("dialog", { name: "CDU walkthrough" });
  await expect(walk).not.toContainText("No flight added");
  await walk.getByRole("button", { name: "Next" }).click();
  // The departure airport, filled in from the flight, in the text and on the screen.
  await expect(walk.locator(".do p")).toHaveText("Type KSEA and press 2L (REF AIRPORT).");
  await expect(walk.locator(".do p .v")).toHaveText("KSEA");
  await expect(walk.getByRole("img").first()).toHaveAttribute("aria-label", /2L: REF AIRPORT KSEA\./);
  await checkScreen(page, "A CDU walkthrough with a flight, from format 7", [walk]);
  const flight = (await saved(page, "involo.flight.ifly-737-max8")) as {
    format: number;
    walkthroughs?: Record<string, number>;
    briefings?: Record<string, { state: string }>;
  };
  expect(flight.format, "saved at today's format").toBe(8);
  expect(flight.walkthroughs?.["preflight-setup"]).toBe(1);
  expect(flight.briefings?.["takeoff-briefing-items-gate-stand"]?.state).toBe("briefed");
});

test("with the board flight imported, the walkthrough shows its values the way the CDU writes them", async ({
  app,
  page,
}) => {
  await app.firstRun();
  await app.open("#/flight/simbrief");
  await app.ready();
  await app.scene(dropOfp);
  await app.open("#/phase/preflight");
  await app.ready();
  await cduCurrent(page);
  await page.locator(CDU).getByRole("button", { name: "Open CDU walkthrough" }).click();
  const walk = page.getByRole("dialog", { name: "CDU walkthrough" });
  const screen = walk.getByRole("img").first();
  const next = async (n: number) => {
    for (let i = 0; i < n; i++) await walk.getByRole("button", { name: "Next" }).click();
  };

  // IDENT: the plan's cycle and its dates.
  await expect(walk).toContainText("IDENT · page 1 of 15");
  await expect(screen).toHaveAttribute("aria-label", /OCT30NOV27\/25/);
  // POS INIT: the departure's position in degrees and minutes, the plan's time and date.
  await next(2);
  await expect(walk).toContainText("POS INIT");
  await expect(screen).toHaveAttribute("aria-label", /N47°26\.9 W122°18\.5/);
  await expect(screen).toHaveAttribute("aria-label", /1000\.0z/);
  await expect(screen).toHaveAttribute("aria-label", /NOV13\/25/);
  // RTE: the STAR at the end is DEP/ARR's, not an airway.
  await next(3);
  await expect(walk).toContainText("Enter the route");
  await expect(screen).toHaveAttribute("aria-label", /MLBEC/);
  await expect(screen).not.toHaveAttribute("aria-label", /BDEGA4/);
  // PERF INIT: gross weight and plan fuel worked out, wind, ISA and the top-of-climb temperature.
  await next(4);
  await expect(walk).toContainText("PERF INIT · page 10 of 15");
  for (const value of ["138.9", "12.4", "270°/045", "+4°F +2°C", "-62°F -52°C"]) {
    await expect(screen).toHaveAttribute("aria-label", new RegExp(escapeRegExp(value)));
  }
  await checkScreen(page, "PERF INIT with the board flight", [walk]);
});

/** `text` as a regular expression that matches it literally: every special character escaped. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}
