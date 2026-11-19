// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The layout and accessibility checks every flow runs on each screen it visits: at phone and
// desktop width, in dark and light, nothing scrolls sideways, no control overlaps another or sits
// off the side of the screen, tap targets are big enough on a phone, the screen's key elements
// show, and an axe scan finds nothing serious. A failure names the screen, width, theme and
// element: "Packs, 390 px, light: the Update button is 31 px tall".

import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page } from "@playwright/test";

/** The two widths every screen is checked at, with the heights of the review sizes. */
export const WIDTHS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;
export const THEMES = ["dark", "light"] as const;
/** What the page's layout gets wrong at its current size, worked out in the page. */
function layoutProblems(phone: boolean): string[] {
  // The smallest tap target on a phone (WCAG 2.5.5, and the boards' 44 px controls).
  const TAP_MIN = 44;
  const out: string[] = [];
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const over = document.documentElement.scrollWidth - vw;
  if (over > 1) out.push(`the page scrolls sideways by ${over} px`);

  const name = (el: Element): string => {
    const label =
      el.getAttribute("aria-label") ??
      (el instanceof HTMLInputElement ? el.labels?.[0]?.textContent : null) ??
      el.textContent ??
      "";
    const text = label.replace(/\s+/g, " ").trim().slice(0, 50);
    const role =
      el.getAttribute("role") ??
      (el.tagName === "A" ? "link" : el.tagName === "INPUT" ? "field" : el.tagName.toLowerCase());
    return text
      ? `the "${text}" ${role}`
      : `a ${role} (${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(" ")[0]}` : ""})`;
  };
  /** The box a control's own `::after` or `::before` covers when it is placed absolutely (a
   * stretched target over its row, or a bigger tap area around a small link), or null. */
  const pseudoBox = (el: Element): DOMRect | null => {
    for (const which of ["::after", "::before"]) {
      const s = getComputedStyle(el, which);
      if (s.content === "none" || s.content === "normal" || s.position !== "absolute") continue;
      let cb: Element | null = el;
      while (cb && cb !== document.body && getComputedStyle(cb).position === "static") cb = cb.parentElement;
      if (!cb) continue;
      const b = cb.getBoundingClientRect();
      const px = (v: string) => (v.endsWith("px") ? Number.parseFloat(v) : null);
      const top = px(s.top);
      const right = px(s.right);
      const bottom = px(s.bottom);
      const left = px(s.left);
      if (top === null || right === null || bottom === null || left === null) continue;
      return new DOMRect(b.left + left, b.top + top, b.width - left - right, b.height - top - bottom);
    }
    return null;
  };
  /** The control's tap area: its own box, grown to any stretched pseudo-element's. */
  const tapBox = (el: Element): DOMRect => {
    const r = el.getBoundingClientRect();
    const p = pseudoBox(el);
    if (!p) return r;
    const left = Math.min(r.left, p.left);
    const top = Math.min(r.top, p.top);
    return new DOMRect(left, top, Math.max(r.right, p.right) - left, Math.max(r.bottom, p.bottom) - top);
  };
  const SELECTOR =
    'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="switch"], [role="checkbox"], [role="radio"], [role="option"]';
  /** Clipped away or scrolled out of reach by an ancestor that hides overflow or scrolls itself. */
  const clipped = (el: Element, r: DOMRect): boolean => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.overflowX === "visible" && s.overflowY === "visible") continue;
      const b = p.getBoundingClientRect();
      if (r.right <= b.left || r.left >= b.right || r.bottom <= b.top || r.top >= b.bottom) return true;
      if ((s.overflowX === "auto" || s.overflowX === "scroll") && p.scrollWidth > p.clientWidth) return true;
    }
    return false;
  };
  const shown = [...document.querySelectorAll(SELECTOR)].filter((el) => {
    if (el.closest("[inert], [aria-hidden='true']")) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    if (r.width <= 1 || r.height <= 1 || s.visibility !== "visible" || Number(s.opacity) === 0) return false;
    return !clipped(el, r);
  });
  // Off the side of the screen (above or below is only scrolled away).
  for (const el of shown) {
    const r = el.getBoundingClientRect();
    if (r.left < -1 || r.right > vw + 1)
      out.push(
        `${name(el)} sits outside the screen (${Math.round(r.left)} to ${Math.round(r.right)} px of ${vw})`,
      );
  }
  // On screen now, and on top: what a tap at its middle reaches.
  const onTop = shown.filter((el) => {
    const r = el.getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= vh) return false;
    const x = Math.min(Math.max(r.left + r.width / 2, 0), vw - 1);
    const y = Math.min(Math.max(r.top + r.height / 2, 0), vh - 1);
    const hit = document.elementFromPoint(x, y);
    return (
      !!hit && (hit === el || el.contains(hit) || hit.contains(el) || !!hit.closest("label")?.contains(el))
    );
  });
  // A bar that stays put (fixed or sticky, such as the phone's Done bar) lies over the content
  // scrolling under it by design: only controls in the same layer can overlap.
  const layer = (el: Element): Element | null => {
    for (let p: Element | null = el; p; p = p.parentElement) {
      const pos = getComputedStyle(p).position;
      if (pos === "fixed" || pos === "sticky") return p;
    }
    return null;
  };
  for (let i = 0; i < onTop.length; i++) {
    for (let j = i + 1; j < onTop.length; j++) {
      const a = onTop[i] as Element;
      const b = onTop[j] as Element;
      if (a.contains(b) || b.contains(a) || layer(a) !== layer(b)) continue;
      // A row's stretched target lies under the controls in that row by design ("the whole row
      // selects the step; the controls in it sit above that target").
      const stretched = (x: Element, y: Element) => {
        const p = pseudoBox(x);
        const r = y.getBoundingClientRect();
        return (
          !!p &&
          r.left >= p.left - 1 &&
          r.right <= p.right + 1 &&
          r.top >= p.top - 1 &&
          r.bottom <= p.bottom + 1
        );
      };
      if (stretched(a, b) || stretched(b, a)) continue;
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (w > 1 && h > 1)
        out.push(`${name(a)} overlaps ${name(b)} by ${Math.round(w)} × ${Math.round(h)} px`);
    }
  }
  if (phone) {
    for (const el of onTop) {
      // A link inside running text is exempt (WCAG 2.5.5), and a box inside its label is as big
      // as the label.
      if (el.tagName === "A" && getComputedStyle(el).display === "inline") continue;
      const target =
        el instanceof HTMLInputElement && el.closest("label") ? (el.closest("label") as Element) : el;
      const r = tapBox(target);
      const small = [
        r.width < TAP_MIN - 0.5 ? `${Math.round(r.width)} px wide` : "",
        r.height < TAP_MIN - 0.5 ? `${Math.round(r.height)} px tall` : "",
      ].filter(Boolean);
      if (small.length) out.push(`${name(el)} is ${small.join(" and ")}`);
    }
  }
  return out;
}

/**
 * Checks the screen on show at both widths and in both themes, then puts the page back as it was.
 * `keys` are the screen's key elements, which must show at every size.
 */
export async function checkScreen(page: Page, screen: string, keys: Locator[] = []): Promise<void> {
  const size = page.viewportSize();
  const problems: string[] = [];
  for (const { width, height } of WIDTHS) {
    await page.setViewportSize({ width, height });
    for (const theme of THEMES) {
      await page.emulateMedia({ colorScheme: theme });
      await page.waitForTimeout(200);
      const at = `${screen}, ${width} px, ${theme}`;
      for (const p of await page.evaluate(layoutProblems, width < 600)) problems.push(`${at}: ${p}`);
      for (const key of keys)
        if (!(await key.first().isVisible())) problems.push(`${at}: ${key} doesn't show`);
      const scan = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      for (const v of scan.violations.filter((x) => x.impact === "serious" || x.impact === "critical")) {
        const where = v.nodes
          .slice(0, 3)
          .map((n) => `${n.target.join(" ")} (${n.html.replace(/\s+/g, " ").slice(0, 90)})`)
          .join("; ");
        problems.push(
          `${at}: ${v.id} (${v.impact}): ${v.help}, at ${where}${v.nodes.length > 3 ? ` and ${v.nodes.length - 3} more` : ""}`,
        );
      }
    }
  }
  await page.emulateMedia({ colorScheme: null });
  if (size) await page.setViewportSize(size);
  expect.soft(problems, `layout and accessibility on ${screen}`).toEqual([]);
}
