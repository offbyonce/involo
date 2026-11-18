// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { STEPS, stepText, targetOf } from "./tour-state.svelte";

/** Lays out the elements matching `shownSel` with a size; every other element is zero-sized. */
function layout(shownSel: string) {
  return vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const on = this.matches(shownSel);
    return {
      top: 10,
      left: 10,
      bottom: on ? 50 : 10,
      right: on ? 200 : 10,
      width: on ? 190 : 0,
      height: on ? 40 : 0,
      x: 10,
      y: 10,
      toJSON: () => ({}),
    } as DOMRect;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("the tour's targets", () => {
  it("lights the stage tabs where they are, else the stage button, else nothing (README)", () => {
    document.body.innerHTML = `<nav data-tour="stages"></nav><button data-tour="stage-button"></button>`;
    layout('[data-tour="stages"]');
    expect(targetOf(2)?.selector).toBe('[data-tour="stages"]');
    vi.restoreAllMocks();
    layout('[data-tour="stage-button"]');
    expect(targetOf(2)?.selector).toBe('[data-tour="stage-button"]');
    vi.restoreAllMocks();
    // Neither on screen: the step is skipped, never empty space lit.
    layout("nothing");
    expect(targetOf(2)).toBeNull();
  });

  it("lights the current row, or below 900 px its Done / Skip for now bar with the row kept", () => {
    document.body.innerHTML = `<ul><li class="it current"><div class="actions"></div></li></ul>`;
    layout("li, .actions");
    expect(targetOf(3)).toMatchObject({ selector: "row", bar: false });
    const actions = document.querySelector(".actions") as HTMLElement;
    actions.style.position = "fixed";
    const bar = targetOf(3);
    expect(bar).toMatchObject({ selector: "bar", bar: true });
    expect(bar?.els[0]).toBe(actions);
    expect(bar?.row).toBe(document.querySelector("li"));
    // No current step (all done, or the Step by step view): skipped.
    document.body.innerHTML = "";
    expect(targetOf(3)).toBeNull();
  });

  it("lights the location line and the panel preview together, only those on screen", () => {
    document.body.innerHTML = `<button class="line" data-tour="where"></button><button class="preview" data-tour="where"></button><aside><button data-tour="where" class="hidden"></button></aside>`;
    layout(".line, .preview");
    expect(targetOf(4)?.els.map((e) => e.className)).toEqual(["line", "preview"]);
    // Apart (the phone's opened row): the line alone.
    vi.restoreAllMocks();
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const top = this.matches(".line") ? 600 : 100;
      const on = this.matches(".line, .preview");
      return {
        top,
        left: 10,
        bottom: on ? top + 40 : top,
        right: on ? 300 : 10,
        width: on ? 290 : 0,
        height: on ? 40 : 0,
        x: 10,
        y: top,
        toJSON: () => ({}),
      } as DOMRect;
    });
    expect(targetOf(4)?.els.map((e) => e.className)).toEqual(["line"]);
  });
});

describe("the tour's words", () => {
  it("has seven steps; step 2 as drawn, for the tabs or the stage button", () => {
    expect(STEPS).toBe(7);
    const tabs = stepText(2, { tabs: true, stages: ["Preflight", "Post-flight"], findKey: "Ctrl K" });
    expect(tabs?.body).toBe(
      "The flight is split into stages, from Preflight to Post-flight, and each stage into phases. The tabs show where you are. Pick any tab to jump there; your place is saved as you go.",
    );
    expect(stepText(2, { tabs: false, stages: ["A", "B"], findKey: "Ctrl K" })?.body).toBe(
      "The flight is split into stages and phases. Tap the stage button to see them all and jump to any phase; your place is saved as you go.",
    );
  });

  it("writes steps 3 to 6 as one heading, two or three plain sentences, and keys where there are keys (README)", () => {
    const opts = { tabs: true, stages: ["Preflight", "Post-flight"] as [string, string], findKey: "Ctrl K" };
    for (const n of [3, 4, 5, 6]) {
      const t = stepText(n, opts);
      expect(t?.title, String(n)).toBeTruthy();
      const sentences = (t?.body ?? "").split(/(?<=[.?])\s+(?=[A-Z])/).length;
      expect(sentences, String(n)).toBeGreaterThanOrEqual(2);
      expect(sentences, String(n)).toBeLessThanOrEqual(3);
    }
    expect(stepText(3, opts)?.keys).toBe("Space done · S skip for now");
    // Step 3 on phone lights the bar, not the row.
    expect(stepText(3, opts)?.body).toMatch(/^The highlighted row is the step to do now\./);
    expect(stepText(3, { ...opts, bar: true })?.body).toBe(
      "The step to do now is at the top of the list. Set the control in the simulator, then press Done here, or pick an answer when the step asks a question. Skip for now leaves it open to come back to.",
    );
    expect(stepText(4, opts)?.body).toBe(
      "Each step with a control says which panel it’s on and where that panel is. Where is this? opens the panel with the step’s controls in blue, and a link to it on the Flight deck.",
    );
    expect(stepText(4, opts)?.keys).toBe("W where is this? · P show panel");
    expect(stepText(5, opts)?.keys).toBeUndefined();
    expect(stepText(6, opts)?.keys).toBe("Ctrl K open Find");
    expect(stepText(6, { ...opts, findKey: "⌘K" })?.keys).toBe("⌘K open Find");
  });
});
