// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// CDU walkthroughs in the interface (#215, CduWalk boards): the step's button and its line, and
// the words the slide-out's header uses.

import type { CduWalk, Step } from "@involo/bindings";

/** What the step rows need: the walkthrough a step opens, and a way to open it. The app makes it
 * from the core's walkthroughs, refreshed with the flight. */
export type Walkthroughs = {
  /** The walkthrough the step's `opens` names, if the pack has it. */
  of(step: Step): CduWalk | undefined;
  /** Opens the step's walkthrough in the slide-out, on the page it stopped at. */
  open(step: Step, number: number): void;
  /** The row form at this width, as for step timers: the button goes under the location line on
   * the desktop's current step and under the value on the tablet's and phone's. */
  layout: "desktop" | "tablet" | "phone";
};

/** "15 pages, IDENT to TAKEOFF REF": how many pages, from the first CDU page to the last. */
export function pagesWords(walk: CduWalk): string {
  const n = walk.pages.length;
  const first = walk.pages[0]?.page ?? "";
  const last = walk.pages[n - 1]?.page ?? "";
  return `${n} ${n === 1 ? "page" : "pages"}${n > 1 && first !== last ? `, ${first} to ${last}` : ""}`;
}

/** The line under the step's button: where the walkthrough goes, or where it stopped. */
export function stepLine(walk: CduWalk): string {
  if (walk.at === undefined) return `${pagesWords(walk)}.`;
  return `Stopped at page ${walk.at + 1} of ${walk.pages.length}, ${walk.pages[walk.at]?.page ?? ""}.`;
}

/** The CDU pages in order, one pill each: a page that spans several walkthrough pages once, with
 * the range of walkthrough pages it covers. */
export function cduPages(walk: CduWalk): { page: string; from: number; to: number }[] {
  const out: { page: string; from: number; to: number }[] = [];
  walk.pages.forEach((p, n) => {
    const last = out[out.length - 1];
    if (last && last.page === p.page && last.to === n - 1) last.to = n;
    else out.push({ page: p.page, from: n, to: n });
  });
  return out;
}
