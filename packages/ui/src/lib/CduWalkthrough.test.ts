// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import type { CduPageView, CduWalk } from "@involo/bindings";
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import CduWalkthrough from "./CduWalkthrough.svelte";
import { cduPages, pagesWords, stepLine } from "./walkthroughs";

afterEach(cleanup);

// An invented walkthrough, as the core sends it: values filled in, two pages on one CDU page.
function page(name: string, title: string, extra: Partial<CduPageView> = {}): CduPageView {
  return {
    page: name,
    title,
    action: [
      { text: "Type ", value: false },
      { text: "12.4", value: true },
      { text: " and press 1L.", value: false },
    ],
    check: [{ text: "The fuel shows.", value: false }],
    note: [],
    screen: {
      title: [{ text: name, value: false }],
      page: [{ text: "1/1", value: false }],
      rows: [
        {
          leftLabel: [{ text: "FUEL", value: false }],
          left: [{ text: "12.4", style: "user", value: true }],
          rightLabel: [],
          right: [
            { text: "<SEL> ", value: false },
            { text: "RW", style: "user", value: false },
            { text: "16L", style: "user", value: true },
          ],
        },
        { separator: "", leftLabel: [], left: [{ text: "<INDEX", value: false }], rightLabel: [], right: [] },
      ],
      highlight: ["1L"],
      scratchpad: [{ text: "12.4", value: true }],
    },
    ...extra,
  };
}
const walk: CduWalk = {
  id: "setup",
  title: "Example set-up",
  flightAdded: true,
  pages: [
    page("INIT", "Check the airplane"),
    page("PERF", "Enter the fuel", { key: "INIT REF" }),
    page("PERF", "Enter the weight"),
    page("TAKEOFF", "Finish"),
  ],
};

function open(at: number, w: CduWalk = walk) {
  const calls: string[] = [];
  render(CduWalkthrough, {
    walk: w,
    page: at,
    step: "Step 12 · CDU",
    list: "Preflight procedure",
    onPage: (n: number) => calls.push(`page ${n}`),
    onClose: () => calls.push("close"),
    onDone: () => calls.push("done"),
    onAddFlight: () => calls.push("add"),
  });
  return calls;
}

describe("walkthrough words (CduWalk boards)", () => {
  it("counts the pages from the first CDU page to the last, and says where it stopped", () => {
    expect(pagesWords(walk)).toBe("4 pages, INIT to TAKEOFF");
    expect(stepLine(walk)).toBe("4 pages, INIT to TAKEOFF.");
    expect(stepLine({ ...walk, at: 2 })).toBe("Stopped at page 3 of 4, PERF.");
    expect(cduPages(walk)).toEqual([
      { page: "INIT", from: 0, to: 0 },
      { page: "PERF", from: 1, to: 2 },
      { page: "TAKEOFF", from: 3, to: 3 },
    ]);
  });
});

describe("CduWalkthrough (CduWalk boards)", () => {
  it("shows the step, the title, the pages, the page's text with its values, and the schematic CDU", () => {
    open(2);
    const dialog = screen.getByRole("dialog", { name: "Example set-up" });
    expect(dialog.querySelector(".step")?.textContent).toBe("Step 12 · CDU");
    expect(dialog.querySelector(".where")?.textContent).toBe(
      "Preflight procedure · 4 pages, INIT to TAKEOFF",
    );
    // One pill per CDU page: INIT done, PERF current on its second walkthrough page, TAKEOFF ahead.
    const pills = [...dialog.querySelectorAll(".pill")];
    expect(pills.map((p) => p.textContent?.replace(/\s+/g, " ").trim())).toEqual([
      "INIT, done",
      "PERF 2/2",
      "TAKEOFF",
    ]);
    expect(pills[1]?.getAttribute("aria-current")).toBe("step");
    expect(dialog.querySelector(".where-page")?.textContent).toBe("PERF · page 3 of 4");
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe("Enter the weight");
    // A flight value in the text is marked; the words around it aren't.
    const value = dialog.querySelector(".do p .v");
    expect(value?.textContent).toBe("12.4");
    expect(dialog.querySelector(".do p")?.textContent).toBe("Type 12.4 and press 1L.");
    // One image with a full text alternative.
    const cdu = screen.getAllByRole("img")[0];
    expect(cdu?.getAttribute("aria-label")).toBe(
      "Schematic CDU on the PERF page. Screen: PERF, 1/1. 1L: FUEL 12.4. 1R: <SEL> RW16L. 2L: <INDEX. Scratchpad: 12.4. Highlighted: 1L.",
    );
    expect(dialog.textContent).not.toContain("No flight added");
  });

  it("goes back and on with the buttons and the arrow keys, and closes on Esc and close", async () => {
    const calls = open(1);
    const dialog = screen.getByRole("dialog");
    await fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await fireEvent.keyDown(dialog, { key: "ArrowRight" });
    await fireEvent.keyDown(dialog, { key: "ArrowLeft" });
    await fireEvent.keyDown(dialog, { key: "Escape" });
    await fireEvent.click(screen.getByRole("button", { name: "Close the CDU walkthrough" }));
    expect(calls).toEqual(["page 0", "page 2", "page 2", "page 0", "close", "close"]);
    // The function key the page uses is drawn under the screen, and named in the text alternative.
    expect(document.querySelector(".fk")?.textContent).toBe("INIT REF");
    expect(screen.getAllByRole("img")[0]?.getAttribute("aria-label")).toMatch(
      /Highlighted: 1L and the INIT REF key\.$/,
    );
  });

  it("has no Back on the first page, and Done on the last, which ticks the step", async () => {
    let calls = open(0);
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    await fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowLeft" });
    expect(calls).toEqual([]);
    cleanup();
    calls = open(3);
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    expect(screen.getByText("Ticks the CDU step and closes.")).toBeTruthy();
    await fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowRight" });
    await fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(calls).toEqual(["done"]);
  });

  it("without a flight, says each page reads what to type instead, with Add your flight", async () => {
    const calls = open(0, { ...walk, flightAdded: false });
    expect(
      screen.getByText("No flight added: each page says what to type instead of your values."),
    ).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Add your flight" }));
    expect(calls).toEqual(["add"]);
  });

  it("keeps six rows on the screen, and the three text styles in a legend", () => {
    open(0);
    const cdu = document.querySelector(".cdu");
    expect(cdu?.querySelectorAll(".line.row")).toHaveLength(6);
    expect([...(cdu?.querySelectorAll(".key.lit") ?? [])].map((k) => k.textContent)).toEqual(["1L"]);
    expect(cdu?.querySelector(".legend")?.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "123 From the airplane 123 Calculated or accepted 123 You type it",
    );
  });
});
