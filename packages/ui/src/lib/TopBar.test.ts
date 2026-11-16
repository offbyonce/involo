// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import type { Rail, RailPhase } from "@involo/bindings";
import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import TopBar from "./TopBar.svelte";

afterEach(cleanup);

const phase = (id: string, title: string): RailPhase => ({
  id,
  title,
  progress: { done: 1, skipped: 0, toDo: 1, total: 2 },
  complete: false,
  open: 1,
  skipped: 0,
});
const rail: Rail = {
  stages: [
    { title: "Alpha", phases: [phase("a1", "First")] },
    { title: "Bravo", phases: [phase("b1", "Second")] },
  ],
  reference: [],
};
const base = {
  aircraft: "Test Jet",
  rail,
  stage: "Bravo",
  view: null,
  menuOpen: false,
  phase: "Second",
  pickerOpen: false,
  onMenu: () => {},
  onView: () => {},
  onPicker: () => {},
};

describe("TopBar", () => {
  it("puts the amber dot on the stage button when another stage holds an open step (StagePicker board)", () => {
    const { container, rerender } = render(TopBar, { ...base, open: [] });
    expect(container.querySelector(".pick .dot")).toBeNull();
    rerender({ ...base, open: ["b1"] });
    expect(container.querySelector(".pick .dot")).toBeNull();
    rerender({ ...base, open: ["a1"] });
    expect(container.querySelector(".pick .dot")).toBeTruthy();
  });
});
