// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// What every end-to-end test starts from: a fresh browser with no network beyond the local site,
// and helpers that act as a pilot does (choose a pack, tick, reload) and read what the app shows
// and saves.

import { test as base, expect, type Page } from "@playwright/test";

export { expect };

/** The pack the catalog publishes, as the first launch lists it. */
export const IFLY = { id: "ifly-737-max8", name: "iFly 737 MAX 8" };

export const test = base.extend<{ app: App }>({
  // No request leaves the machine: anything not on the local site is refused, and the test fails
  // naming it, so a flow that needs the network shows up at once.
  context: async ({ context }, use) => {
    const outside: string[] = [];
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return route.continue();
      outside.push(url.href);
      return route.abort("blockedbyclient");
    });
    await use(context);
    expect(outside, "requests outside the local site").toEqual([]);
  },
  app: async ({ page }, use) => {
    await use(new App(page));
  },
});

/** The app as a pilot uses it. */
export class App {
  constructor(readonly page: Page) {}

  /** Opens the app at `hash` (the first launch when nothing is installed yet). */
  async open(hash = ""): Promise<void> {
    await this.page.goto(hash ? `./${hash}` : "./");
  }

  /** Waits until the app has started on a pack (the menu exists once it has). */
  async ready(): Promise<void> {
    await expect(this.page.locator("[data-app-ready]").first()).toBeAttached({ timeout: 30_000 });
  }

  /** The first launch: downloads the iFly pack from the catalog, as a pilot does, and lands on
   * its checklist with the welcome answered "Not now". */
  async firstRun(): Promise<void> {
    await this.open();
    await this.page.getByRole("button", { name: `Download ${IFLY.name}` }).click();
    await this.ready();
    await this.answerWelcome();
  }

  /** Answers the welcome "Not now". It opens a moment after a first launch (no saved flight, the
   * tour not yet answered); later launches don't show it. */
  async answerWelcome(): Promise<void> {
    const welcome = this.page.getByRole("dialog", { name: "Welcome to Involo" });
    await welcome.waitFor({ state: "visible", timeout: 15_000 });
    await welcome.getByRole("button", { name: "Not now" }).click();
    await expect(welcome).toBeHidden();
  }

  /** The welcome isn't showing. */
  async dismissWelcome(): Promise<void> {
    await expect(this.page.getByRole("dialog", { name: "Welcome to Involo" })).toBeHidden();
  }

  /** Reloads the page and waits for the app to start again. */
  async reload(): Promise<void> {
    await this.page.reload();
    await this.ready();
    await this.dismissWelcome();
  }

  /** Runs one of the review shots' scenes (apps/web/build/scenes.mjs) in the page. */
  async scene(steps: string | string[]): Promise<void> {
    for (const step of [steps].flat()) {
      await this.page.evaluate(step);
      await this.page.waitForTimeout(250);
    }
  }
}

/** The checklist row's tick for the step named `name`, while it is unticked ("Confirm …"). */
export const tickOf = (page: Page, name: string) =>
  page.getByRole("button", { name: new RegExp(`^Confirm ${name}:`) });
/** The same tick once the step is ticked ("Clear the tick on …"). */
export const tickedOf = (page: Page, name: string) =>
  page.getByRole("button", { name: `Clear the tick on ${name}` });

/** What the app saved on this device under `key` (a localStorage key), as JSON. */
export async function saved(page: Page, key: string): Promise<unknown> {
  const text = await page.evaluate((k) => localStorage.getItem(k), key);
  return text === null ? null : JSON.parse(text);
}

/** The steps the saved flight of pack `pack` has ticked, by step id. */
export async function tickedIds(page: Page, pack: string): Promise<string[]> {
  const flight = (await saved(page, `involo.flight.${pack}`)) as {
    session?: { done?: Record<string, unknown> };
  } | null;
  return Object.keys(flight?.session?.done ?? {});
}
