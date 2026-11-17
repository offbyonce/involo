// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The tour (Tour boards and README, 2026-11-16): seven steps. The welcome card is step 1
// and "You're set" step 7, both centered; steps 2 to 6 each light up one real element. It stores
// only whether the welcome has been seen (Settings.tourSeen), and never changes the flight.

/** The step on screen (1 to 7), or null when the tour is closed. */
export const tour = $state<{ step: number | null; dir: 1 | -1 }>({ step: null, dir: 1 });

export const STEPS = 7;

/** One lit step's words: a heading, the sentences, and its keys line where it has keys. */
export type StepText = { title: string; body: string; keys?: string };

/** Which element a step lights up, in the order to try (the one that does the same job at this
 * size comes next). Step 3 is the current row; see `currentTarget`. */
export const TARGETS: Record<number, string[]> = {
  2: ['[data-tour="stages"]', '[data-tour="stage-button"]'],
  4: ['[data-tour="where"]'],
  5: ['[data-tour="strip"]'],
  6: ['[data-tour="find"]'],
};

/**
 * The words for steps 2 to 6. Step 2 is as drawn (TourStep, TourStepPhone): the tabs where the stage
 * tabs are lit, the stage button where it is. Steps 3 to 6 are written in the same voice (README).
 * `stages` are the flight's first and last stage titles; `findKey` the Find keys as this computer
 * writes them (Ctrl K, or ⌘K on a Mac).
 */
export function stepText(
  step: number,
  opts: { tabs: boolean; bar?: boolean; stages: [string, string]; findKey: string },
): StepText | null {
  switch (step) {
    case 2:
      return opts.tabs
        ? {
            title: "Stages and phases",
            body: `The flight is split into stages, from ${opts.stages[0]} to ${opts.stages[1]}, and each stage into phases. The tabs show where you are. Pick any tab to jump there; your place is saved as you go.`,
          }
        : {
            title: "Stages and phases",
            body: "The flight is split into stages and phases. Tap the stage button to see them all and jump to any phase; your place is saved as you go.",
          };
    case 3:
      return {
        title: "The current step",
        // On phone the Done / Skip for now bar is lit, not the row.
        body: opts.bar
          ? "The step to do now is at the top of the list. Set the control in the simulator, then press Done here, or pick an answer when the step asks a question. Skip for now leaves it open to come back to."
          : "The highlighted row is the step to do now. Set the control in the simulator, then press Done, or pick an answer when the step asks a question. Skip for now leaves it open to come back to.",
        keys: "Space done · S skip for now",
      };
    case 4:
      return {
        title: "Where is this?",
        body: "Each step with a control says which panel it’s on and where that panel is. Where is this? opens the panel with the step’s controls in blue, and a link to it on the Flight deck.",
        keys: "W where is this? · P show panel",
      };
    case 5:
      return {
        title: "The flight strip",
        body: "Your route, runway, SID, squawk and the rest of this flight’s details sit here. Import them from SimBrief, or open the strip and enter the clearance yourself. Steps that need a value then show yours.",
      };
    case 6:
      return {
        title: "Find",
        body: "Find looks through every step, control and term for this aircraft. Type a few letters of a name to jump straight to it.",
        keys: `${opts.findKey} open Find`,
      };
    default:
      return null;
  }
}

/** Whether an element is laid out on screen at this size (not hidden, not zero-sized). */
export function shown(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  const style = getComputedStyle(el);
  return style.visibility !== "hidden" && style.display !== "none";
}

export type Box = { top: number; left: number; bottom: number; right: number };

/** The box around some elements. */
export function union(els: Element[]): Box | null {
  let box: Box | null = null;
  for (const el of els) {
    const r = el.getBoundingClientRect();
    box = box
      ? {
          top: Math.min(box.top, r.top),
          left: Math.min(box.left, r.left),
          bottom: Math.max(box.bottom, r.bottom),
          right: Math.max(box.right, r.right),
        }
      : { top: r.top, left: r.left, bottom: r.bottom, right: r.right };
  }
  return box;
}

/** A lit step's element: the elements to ring, and, for the current step on narrow screens, the
 * row to keep in view while its bar is lit. */
export type Target = { els: Element[]; selector: string; bar: boolean; row: Element | null };

/** The element a lit step points at, at the current size; null when none is on screen, so the step
 * is skipped (never light up empty space). */
export function targetOf(step: number, root: ParentNode = document): Target | null {
  if (step === 3) {
    const row = root.querySelector("li.it.current");
    if (!row || !shown(row)) return null;
    // Below 900 px Done and Skip for now sit in the fixed bar at the foot of the screen: the bar is
    // lit, with the card above it and the row in view above that.
    const actions = row.querySelector(".actions");
    if (actions && shown(actions) && getComputedStyle(actions).position === "fixed")
      return { els: [actions], selector: "bar", bar: true, row };
    return { els: [row], selector: "row", bar: false, row: null };
  }
  for (const selector of TARGETS[step] ?? []) {
    let els = [...root.querySelectorAll(selector)].filter(shown);
    // Step 4: the location line and the preview together where they sit one under the other (the
    // side pane); where they are apart (the phone's opened row), the line alone, with its Where is
    // this?, so the ring never runs under the sheet.
    if (step === 4 && els.length > 1) {
      const rects = els
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .sort((a, b) => a.r.top - b.r.top);
      const apart = rects.some((x, i) => i > 0 && x.r.top - (rects[i - 1]?.r.bottom ?? x.r.top) > 24);
      const line = els.find((el) => el.classList.contains("line"));
      if (apart && line) els = [line];
    }
    if (els.length) return { els, selector, bar: false, row: null };
  }
  return null;
}
