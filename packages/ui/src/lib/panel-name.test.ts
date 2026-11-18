// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { appLabels } from "../test-pack";
import { panelName, panelTitle, sectionName } from "./panel-name";

/** The default side words, as a pack without its own has them. */
const SIDES = appLabels().sideWords;

describe("panel names", () => {
  it("names one panel as the pack writes it: its name, else its title", () => {
    expect(sectionName({ title: "Electrical meters", name: "Electrical meters panel" })).toBe(
      "Electrical meters panel",
    );
    expect(sectionName({ title: "Doors panel" })).toBe("Doors panel");
    expect(panelName("Control stand")).toBe("Control stand");
    expect(panelTitle(["Fuel panel"], SIDES)).toEqual({ title: "Fuel panel", also: null });
  });

  it("adds nothing to a name: a test pack's FCU and ECAM read as written", () => {
    expect(panelTitle(["FCU", "ECAM"], SIDES)).toEqual({ title: "FCU", also: "ECAM" });
    expect(panelName("ECAM control panel")).toBe("ECAM control panel");
  });

  it("names a left and right pair as one, by the side words, in their order", () => {
    expect(panelTitle(["L wiper panel", "R wiper panel"], SIDES).title).toBe("L and R wiper panels");
    expect(panelTitle(["R wiper panel", "L wiper panel"], SIDES).title).toBe("L and R wiper panels");
    expect(panelTitle(["Captain EFIS panel", "First officer EFIS panel"], SIDES).title).toBe(
      "Captain and first officer EFIS panels",
    );
    expect(panelTitle(["Captain displays", "First officer displays"], SIDES).title).toBe(
      "Captain and first officer displays",
    );
    expect(panelTitle(["Left annunciators", "Right annunciators"], SIDES).title).toBe(
      "Left and right annunciators",
    );
    expect(panelTitle(["Left CDU", "Right CDU"], SIDES).title).toBe("Left and right CDUs");
    // Without side words, no pair.
    expect(panelTitle(["Left CDU", "Right CDU"]).also).toBe("Right CDU");
  });

  it("pairs a test pack's own side words", () => {
    // Invented: a pack whose seats are pilot and copilot.
    const sides = ["PILOT", "COPILOT"];
    expect(panelTitle(["Pilot FCU", "Copilot FCU"], sides).title).toBe("Pilot and copilot FCUs");
    expect(panelTitle(["Pilot FCU", "Copilot FCU"], SIDES).also).toBe("Copilot FCU");
  });

  it("otherwise names the main panel and adds the others as Also, never chained with 'and'", () => {
    expect(panelTitle(["Fuel panel", "Hydraulic panel"], SIDES)).toEqual({
      title: "Fuel panel",
      also: "Hydraulic panel",
    });
    expect(
      panelTitle(["Ground power and generators panel", "Electrical meters panel", "L wiper panel"], SIDES),
    ).toEqual({
      title: "Ground power and generators panel",
      also: "Electrical meters panel, L wiper panel",
    });
  });

  it("names a numbered pair as one, and pairs in the Also line too", () => {
    expect(panelTitle(["Radio 1 panel", "Radio 2 panel"], SIDES)).toEqual({
      title: "Radio 1 and 2 panels",
      also: null,
    });
    expect(panelTitle(["NAV 1 panel", "NAV 2 panel"], SIDES).title).toBe("NAV 1 and 2 panels");
    expect(panelTitle(["FCU 1", "FCU 2"], SIDES).title).toBe("FCU 1 and 2");
    expect(panelTitle(["Oxygen mask", "Audio 1 panel", "Audio 2 panel"], SIDES)).toEqual({
      title: "Oxygen mask",
      also: "Audio 1 and 2 panels",
    });
    expect(
      panelTitle(["Left CDU", "Right CDU", "Captain EFIS panel", "First officer EFIS panel"], SIDES),
    ).toEqual({
      title: "Left and right CDUs",
      also: "Captain and first officer EFIS panels",
    });
    // Not consecutive numbers: not a pair.
    expect(panelTitle(["Radio 1 panel", "Radio 3 panel"], SIDES).also).toBe("Radio 3 panel");
  });

  it("holds no word list", async () => {
    const { readFileSync } = await import("node:fs");
    const text = readFileSync(`${import.meta.dirname}/panel-name.ts`, "utf8");
    expect(text).not.toMatch(/new Set\(|"(stand|displays|lever|annunciators|cdu)"|Captain|First officer/i);
  });
});
