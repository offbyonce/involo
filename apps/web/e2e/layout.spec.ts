// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The layout check's tap-size rule measures a control's tap area, wherever the page is scrolled:
// the panel preview's Show panel button draws 21 px of text, and passes because its target is
// the whole card, not because the check skips it (the phone's Done bar lies over it as the
// checklist opens).

import { expect, test } from "./fixtures";
import { layoutProblems, resizeTo, screenProblems } from "./layout";

test("the tap check measures Show panel by the card it covers", async ({ app, page }) => {
  await app.firstRun();
  await resizeTo(page, { width: 390, height: 844 });
  const show = page.getByRole("button", { name: /^Show panel/ }).first();
  await expect(show).toBeVisible();
  const drawn = await show.boundingBox();
  expect(drawn?.height ?? 0, "the button's own box is under the touch size").toBeLessThan(44);
  const findings = async () =>
    (await page.evaluate(layoutProblems, true)).filter((p) => p.includes('"Show panel'));

  expect(await findings(), "the card is its tap area").toEqual([]);

  // Without its stretched target, the same button is too small, and the check says so.
  await page.evaluate(() =>
    document.styleSheets[0]?.insertRule(".show::after { content: none !important; }", 0),
  );
  expect(await findings(), "the check measures the button, it doesn't skip it").toEqual([
    expect.stringMatching(/^the "Show panel: .*" button is \d+ px tall$/),
  ]);
});

// The check looks at a screen only once the page has finished reacting to the new size. Here the
// page answers the phone width in steps, as an app does when a media-query listener redraws and
// what it draws settles in turn: a fixed wait after resizing looked too soon and called the
// screen's key element missing.
test("the layout check waits for the page to finish reacting to a resize", async ({ app, page }) => {
  await app.firstRun();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    const query = matchMedia("(max-width: 599px)");
    const mark = document.createElement("p");
    mark.id = "settle-mark";
    mark.textContent = "Wide";
    document.body.prepend(mark);
    query.addEventListener("change", () => {
      // Five steps 60 ms apart, each changing the page: 300 ms in all.
      let step = 0;
      const next = () => {
        step++;
        mark.textContent = query.matches ? `Narrowing ${step}` : "Wide";
        mark.hidden = query.matches && step < 5;
        if (query.matches && step < 5) setTimeout(next, 60);
      };
      next();
    });
  });
  const mark = page.locator("#settle-mark");
  const problems = await screenProblems(page, "A page that settles in steps", [mark]);
  expect(problems.filter((p) => p.includes("settle-mark"))).toEqual([]);
});
