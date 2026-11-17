// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import type { Step } from "@involo/bindings";
import { describe, expect, it } from "vitest";
import { answered, stepValue } from "./answers.svelte";

const fuel = {
  id: "fuel",
  text: "FUEL PUMP SWITCHES",
  expect: "MAIN PUMPS ON · CENTER PUMPS ON OR OFF FROM YOUR CENTER TANK ANSWER",
  expect_when: [
    { option: "center_tank", equals: "more", expect: "MAIN PUMPS ON · CENTER PUMPS ON" },
    { option: "center_tank", equals: "less", expect: "MAIN PUMPS ON · CENTER PUMPS OFF" },
  ],
} as unknown as Step;

describe("a step's value for the flight's answers (decision 0027)", () => {
  it("shows the step's own value until the option is answered, then that answer's", () => {
    expect(stepValue(fuel, {})).toBe(fuel.expect);
    expect(stepValue(fuel, { center_tank: "less" })).toBe("MAIN PUMPS ON · CENTER PUMPS OFF");
    expect(stepValue(fuel, { center_tank: "more", power: "gpu" })).toBe("MAIN PUMPS ON · CENTER PUMPS ON");
    // A step with no values per answer keeps its own.
    expect(stepValue({ ...fuel, expect_when: [] } as Step, { center_tank: "less" })).toBe(fuel.expect);
  });

  it("reads the flight's answers the app keeps by default (the pane, Flow and open steps use it)", () => {
    answered.options = { center_tank: "less" };
    expect(stepValue(fuel)).toBe("MAIN PUMPS ON · CENTER PUMPS OFF");
    answered.options = {};
    expect(stepValue(fuel)).toBe(fuel.expect);
  });
});
