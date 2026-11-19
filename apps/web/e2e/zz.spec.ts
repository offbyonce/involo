import AxeBuilder from "@axe-core/playwright";
import { test } from "./fixtures";

test("x", async ({ app, page }) => {
  await app.firstRun();
  for (const w of [390, 1440]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(300);
    const r = await new AxeBuilder({ page }).withRules(["label-content-name-mismatch"]).analyze();
    for (const v of r.violations)
      for (const n of v.nodes)
        console.log(
          w,
          n.target.join(" "),
          "|",
          [...n.any, ...n.all, ...n.none].map((a) => `${a.message} ${JSON.stringify(a.data)}`).join(" / "),
        );
    console.log(
      w,
      await page.evaluate(() => {
        const f = document.querySelector(".find");
        const p = document.querySelector(".preview");
        const vis = (e: Element | null) =>
          e
            ? [...e.querySelectorAll("*")]
                .filter(
                  (x) =>
                    x.childNodes.length &&
                    [...x.childNodes].some((c) => c.nodeType === 3 && c.textContent?.trim()),
                )
                .map(
                  (x) =>
                    `<${x.tagName.toLowerCase()} ${x.getAttribute("aria-hidden") ?? ""} ${getComputedStyle(x).display}>${x.textContent?.trim().slice(0, 40)}`,
                )
                .join(" ; ")
            : "";
        return `${vis(f)} ||| ${vis(p)} ||| ${p?.getAttribute("aria-label")}`;
      }),
    );
  }
});
