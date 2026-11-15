// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import type { Rail, RailPhase } from "@involo/bindings";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import StagePicker from "./StagePicker.svelte";

afterEach(cleanup);

const phase = (id: string, title: string, done: number, total: number, skipped = 0): RailPhase => ({
  id,
  title,
  progress: { done, skipped, toDo: total - done - skipped, total },
  complete: done === total,
  open: total - done,
  skipped,
});

/** Invented stages in pack order: one done (with a skipped step), one under way, two not begun. */
const rail: Rail = {
  stages: [
    { title: "Alpha", phases: [phase("a1", "First", 3, 3), phase("a2", "Second", 2, 3, 1)] },
    {
      title: "Bravo",
      phases: [phase("b1", "Third", 4, 4), phase("b2", "Fourth", 5, 10), phase("b3", "Fifth", 0, 6)],
    },
    { title: "Charlie", phases: [phase("c1", "Sixth", 0, 4)] },
    { title: "Delta", phases: [phase("d1", "Seventh", 0, 2), phase("d2", "Eighth", 0, 2)] },
  ],
  reference: [],
};

describe("StagePicker", () => {
  it("lists every stage and phase from the pack, in order, with each row's state (StagePicker board)", () => {
    render(StagePicker, { rail, current: "b2", open: ["a2"], onClose: () => {} });
    expect(screen.getByRole("dialog", { name: "Stage and phase" })).toBeTruthy();
    expect(screen.getByText("Pick a phase to go to its first open step.")).toBeTruthy();
    const groups = screen.getAllByRole("group").map((g) => g.getAttribute("aria-label"));
    expect(groups).toEqual(["Alpha", "Bravo", "Charlie", "Delta"]);
    // Done, in progress, and nothing for a stage not begun.
    expect(within(screen.getByRole("group", { name: "Alpha" })).getByText("Done")).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "Bravo" })).getByText("In progress")).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "Charlie" })).queryByText(/Done|In progress/)).toBeNull();
    // The current phase: its count and aria-current="step"; a done phase with a skipped step says
    // how many are open.
    const here = screen.getByRole("link", { name: "Fourth, current, 5/10" });
    expect(here.getAttribute("aria-current")).toBe("step");
    expect(screen.getByRole("link", { name: "Second, done, 1 open step" }).textContent).toContain("1 open");
    expect(screen.getByRole("link", { name: "Third, done" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Fifth" }).getAttribute("href")).toBe("#/phase/b3");
  });

  it("splits the stages into two columns at half the rows, for tablet and the pop-over", () => {
    const { container } = render(StagePicker, { rail, current: "b2", onClose: () => {} });
    const cols = [...container.querySelectorAll(".col")].map((c) =>
      [...c.querySelectorAll("h3")].map((h) => h.textContent),
    );
    expect(cols).toEqual([
      ["Alpha", "Bravo"],
      ["Charlie", "Delta"],
    ]);
  });

  it("closes on a pick, on Close, on the scrim and on Esc, and moves focus to the current phase", async () => {
    let closed = 0;
    render(StagePicker, { rail, current: "b2", onClose: () => closed++ });
    expect(document.activeElement?.getAttribute("aria-current")).toBe("step");
    await fireEvent.click(screen.getByRole("link", { name: "Sixth" }));
    await fireEvent.click(screen.getAllByRole("button", { name: "Close" })[1] as HTMLElement);
    await fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0] as HTMLElement);
    await fireEvent.keyDown(window, { key: "Escape" });
    expect(closed).toBe(4);
  });
});
