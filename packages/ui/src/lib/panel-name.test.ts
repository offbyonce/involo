// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { panelName, panelTitle } from "./panel-name";

describe("panel names (owner, batch 6)", () => {
  it("names one panel from the pack's title, in sentence case, once", () => {
    expect(panelName("Electrical meters")).toBe("Electrical meters panel");
    expect(panelName("Doors panel")).toBe("Doors panel");
    expect(panelName("ground power and generators")).toBe("Ground power and generators panel");
    expect(panelTitle(["Fuel panel"])).toEqual({ title: "Fuel panel", also: null });
  });

  it("names a left and right pair as one", () => {
    expect(panelTitle(["L wiper", "R wiper"]).title).toBe("L and R wiper panels");
    expect(panelTitle(["Captain EFIS", "First officer EFIS"]).title).toBe(
      "Captain and first officer EFIS panels",
    );
  });

  it("otherwise names the main panel and adds the others as Also, never chained with 'and'", () => {
    expect(panelTitle(["Fuel", "Hydraulic"])).toEqual({ title: "Fuel panel", also: "Hydraulic panel" });
    expect(panelTitle(["Ground power and generators", "Electrical meters", "L wiper"])).toEqual({
      title: "Ground power and generators panel",
      also: "Electrical meters panel, L wiper panel",
    });
  });

  it("adds panel only when the name does not already end in a thing", () => {
    expect(panelName("Control stand")).toBe("Control stand");
    expect(panelName("Captain displays")).toBe("Captain displays");
    expect(panelName("Parking brake and start levers")).toBe("Parking brake and start levers");
    expect(panelName("Captain lights")).toBe("Captain lights panel");
    expect(panelTitle(["Captain displays", "First officer displays"]).title).toBe(
      "Captain and first officer displays",
    );
    expect(panelTitle(["Left annunciators", "Right annunciators"]).title).toBe("Left and right annunciators");
    expect(panelTitle(["Left CDU", "Right CDU"]).title).toBe("Left and right CDUs");
  });

  it("names a numbered pair as one, and pairs in the Also line too", () => {
    expect(panelTitle(["Radio 1", "Radio 2"])).toEqual({ title: "Radio 1 and 2 panels", also: null });
    expect(panelTitle(["NAV 1", "NAV 2"]).title).toBe("NAV 1 and 2 panels");
    expect(panelTitle(["Oxygen mask", "Audio 1", "Audio 2"])).toEqual({
      title: "Oxygen mask",
      also: "Audio 1 and 2 panels",
    });
    expect(panelTitle(["Left CDU", "Right CDU", "Captain EFIS", "First officer EFIS"])).toEqual({
      title: "Left and right CDUs",
      also: "Captain and first officer EFIS panels",
    });
    // Not consecutive numbers: not a pair.
    expect(panelTitle(["Radio 1", "Radio 3"]).also).toBe("Radio 3 panel");
  });
});
